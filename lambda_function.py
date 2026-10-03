import pandas as pd
import io
import json
import os

from azure.storage.blob import BlobServiceClient

def process_nutritional_data_from_azurite():
    connect_str = (
        "DefaultEndpointsProtocol=http;"
        "AccountName=devstoreaccount1;"
        "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
        "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
    )

    blob_service_client = BlobServiceClient.from_connection_string(connect_str)

    container_name = "datasets"
    blob_name = "All_Diets.csv"

    container_client = (
        blob_service_client.get_container_client(
            container_name
        )
    )

    blob_client = container_client.get_blob_client(
        blob_name
    )

    print("\nConnecting to Azurite...")
    print("Container:", container_name)
    print("Blob:", blob_name)

    stream = blob_client.download_blob().readall()

    print("\nCSV successfully downloaded from Azurite.")

    df = pd.read_csv(io.BytesIO(stream))

    print("Number of recipes:", len(df))

    nutrition_columns = [
        "Protein(g)",
        "Carbs(g)",
        "Fat(g)"
    ]

    for column in nutrition_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

        df[column] = df[column].fillna(
            df[column].mean()
        )

    df["Diet_type"] = df["Diet_type"].fillna(
        "Unknown"
    )

    avg_macros = df.groupby("Diet_type")[
        nutrition_columns
    ].mean()

    print(avg_macros.round(2))

    result = (
        avg_macros
        .reset_index()
        .to_dict(orient="records")
    )

    os.makedirs(
        "simulated_nosql",
        exist_ok=True
    )

    output_file = (
        "simulated_nosql/results.json"
    )

    with open(
        output_file,
        "w"
    ) as f:

        json.dump(
            result,
            f,
            indent=4
        )

    print(
        "Results saved to:",
        output_file
    )
    return (
        "Data processed and stored successfully."
    )

if __name__ == "__main__":

    message = (
        process_nutritional_data_from_azurite()
    )

    print("\n" + message)

    

