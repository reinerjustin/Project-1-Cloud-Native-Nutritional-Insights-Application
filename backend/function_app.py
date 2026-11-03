import io
import json
import logging
import os
import time

from datetime import datetime, timezone

import pandas as pd
import azure.functions as func

from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient


app = func.FunctionApp()

NUTRITION_COLUMNS = [
    "Protein(g)",
    "Carbs(g)",
    "Fat(g)"
]


def json_records(dataframe):
    """Convert a DataFrame into JSON-compatible records."""

    records = []

    for row in dataframe.to_dict(orient="records"):

        clean_row = {}

        for key, value in row.items():

            if pd.isna(value):
                clean_row[key] = None

            elif hasattr(value, "item"):
                clean_row[key] = value.item()

            else:
                clean_row[key] = value

        records.append(clean_row)

    return records


def download_dataset():
    """
    Download All_Diets.csv from real Azure Blob Storage.

    Local development:
        DefaultAzureCredential uses the Azure CLI login.

    Azure deployment:
        DefaultAzureCredential uses the Function App's
        managed identity.
    """

    account_url = os.environ["BLOB_ACCOUNT_URL"]

    container_name = os.getenv(
        "BLOB_CONTAINER_NAME",
        "datasets"
    )

    blob_name = os.getenv(
        "BLOB_NAME",
        "All_Diets.csv"
    )

    credential = DefaultAzureCredential()

    blob_service = BlobServiceClient(
        account_url=account_url,
        credential=credential
    )

    try:

        blob_client = blob_service.get_blob_client(
            container=container_name,
            blob=blob_name
        )

        logging.info(
            "Downloading dataset: %s",
            blob_name
        )

        file_bytes = (
            blob_client
            .download_blob()
            .readall()
        )

        logging.info(
            "Dataset downloaded successfully."
        )

        return file_bytes

    finally:

        blob_service.close()
        credential.close()


def process_nutritional_data(csv_bytes):
    """
    Clean the dataset and calculate dashboard insights.
    """

    df = pd.read_csv(
        io.BytesIO(csv_bytes)
    )

    required_columns = [
        "Diet_type",
        *NUTRITION_COLUMNS
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:

        raise ValueError(
            "Dataset is missing required columns: "
            + ", ".join(missing_columns)
        )

    total_recipes = len(df)

    # ----------------------------------
    # 1. Clean numerical values
    # ----------------------------------

    missing_macro_values = 0

    for column in NUTRITION_COLUMNS:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        missing_macro_values += int(
            df[column].isna().sum()
        )

        column_mean = df[column].mean()

        if pd.isna(column_mean):
            column_mean = 0.0

        df[column] = df[column].fillna(
            column_mean
        )

    # ----------------------------------
    # 2. Clean categorical values
    # ----------------------------------

    df["Diet_type"] = (
        df["Diet_type"]
        .fillna("Unknown")
        .astype(str)
    )

    if "Recipe_name" not in df.columns:
        df["Recipe_name"] = "Unnamed recipe"

    else:
        df["Recipe_name"] = (
            df["Recipe_name"]
            .fillna("Unnamed recipe")
        )

    if "Cuisine_type" not in df.columns:
        df["Cuisine_type"] = "Unknown"

    else:
        df["Cuisine_type"] = (
            df["Cuisine_type"]
            .fillna("Unknown")
        )

    # ----------------------------------
    # 3. Calculate average macronutrients
    # ----------------------------------

    averages = (
        df.groupby("Diet_type")[NUTRITION_COLUMNS]
        .mean()
        .reset_index()
    )

    averages = averages.rename(
        columns={
            "Diet_type": "diet_type",
            "Protein(g)": "protein_g",
            "Carbs(g)": "carbs_g",
            "Fat(g)": "fat_g"
        }
    )

    # ----------------------------------
    # 4. Calculate recipe counts
    # ----------------------------------

    recipe_counts = (
        df.groupby("Diet_type")
        .size()
        .reset_index(name="recipe_count")
    )

    recipe_counts = recipe_counts.rename(
        columns={
            "Diet_type": "diet_type"
        }
    )

    # ----------------------------------
    # 5. Calculate nutritional ratios
    # ----------------------------------

    df["Protein_to_Carbs_ratio"] = (
        df["Protein(g)"]
        / df["Carbs(g)"].where(
            df["Carbs(g)"] != 0
        )
    )

    df["Carbs_to_Fat_ratio"] = (
        df["Carbs(g)"]
        / df["Fat(g)"].where(
            df["Fat(g)"] != 0
        )
    )

    # ----------------------------------
    # 6. Find top 5 protein recipes
    #    for each diet type
    # ----------------------------------

    top_recipes = (
        df.sort_values(
            ["Diet_type", "Protein(g)"],
            ascending=[True, False]
        )
        .groupby("Diet_type")
        .head(5)
    )

    top_recipes = top_recipes.rename(
        columns={
            "Diet_type": "diet_type",
            "Recipe_name": "recipe_name",
            "Cuisine_type": "cuisine_type",
            "Protein(g)": "protein_g",
            "Carbs(g)": "carbs_g",
            "Fat(g)": "fat_g",
            "Protein_to_Carbs_ratio":
                "protein_to_carbs_ratio",
            "Carbs_to_Fat_ratio":
                "carbs_to_fat_ratio"
        }
    )

    top_recipes = top_recipes[
        [
            "diet_type",
            "recipe_name",
            "cuisine_type",
            "protein_g",
            "carbs_g",
            "fat_g",
            "protein_to_carbs_ratio",
            "carbs_to_fat_ratio"
        ]
    ]

    # ----------------------------------
    # 7. Find the diet with the highest
    #    average protein content
    # ----------------------------------

    highest_protein_diet = (
        averages.sort_values(
            "protein_g",
            ascending=False
        ).iloc[0]
    )

    highest_protein_diet = {
        "diet_type": highest_protein_diet["diet_type"],
        "average_protein_g": float(
            highest_protein_diet["protein_g"]
        )
    }

    # ----------------------------------
    # 8. Find most common cuisine
    #    for each diet type
    # ----------------------------------

    common_cuisines = []

    for diet, group in df.groupby("Diet_type"):

        cuisine_counts = (
            group["Cuisine_type"]
            .value_counts()
        )

        most_common = (
            cuisine_counts.index[0]
            if not cuisine_counts.empty
            else "Unknown"
        )

        common_cuisines.append(
            {
                "diet_type": diet,
                "cuisine_type": most_common
            }
        )

    # ----------------------------------
    # 9. Build final API response
    # ----------------------------------

    result = {

        "metadata": {

            "dataset": "All_Diets.csv",

            "generated_at_utc":
                datetime.now(
                    timezone.utc
                ).isoformat(),

            "total_recipes": total_recipes,

            "missing_macro_values_filled":
                missing_macro_values

        },

        "diet_types": sorted(
            df["Diet_type"].unique().tolist()
        ),

        "averages_by_diet":
            json_records(averages),

        "recipe_counts_by_diet":
            json_records(recipe_counts),

        "top_protein_recipes":
            json_records(top_recipes),

        "highest_protein_diet":
            highest_protein_diet,

        "most_common_cuisine_by_diet":
            common_cuisines

    }

    return result


# ======================================
# HTTP TRIGGER
# ======================================

@app.route(
    route="insights",
    methods=["GET"],
    auth_level=func.AuthLevel.ANONYMOUS
)

def get_nutritional_insights(
    req: func.HttpRequest
) -> func.HttpResponse:

    start_time = time.perf_counter()

    try:

        logging.info(
            "Nutritional insights request received."
        )

        # Download CSV from Azure Blob Storage

        csv_bytes = download_dataset()

        # Process nutritional information

        result = process_nutritional_data(
            csv_bytes
        )

        # Calculate execution time

        execution_time = round(
            (time.perf_counter() - start_time)
            * 1000,
            2
        )

        result["metadata"]["execution_time_ms"] = (
            execution_time
        )

        logging.info(
            "Processing completed in %s ms",
            execution_time
        )

        return func.HttpResponse(
            json.dumps(
                result,
                allow_nan=False
            ),
            status_code=200,
            mimetype="application/json"
        )

    except Exception:

        logging.exception(
            "Nutritional data processing failed."
        )

        return func.HttpResponse(
            json.dumps(
                {
                    "error": (
                        "Unable to process nutritional "
                        "data. Check Function App logs."
                    )
                }
            ),
            status_code=500,
            mimetype="application/json"
        )
