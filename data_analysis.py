import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os

os.makedirs("output", exist_ok=True)

df = pd.read_csv("All_Diets.csv")

nutrition_cols = ["Protein(g)", "Carbs(g)", "Fat(g)"]

for col in nutrition_cols:
    df[col] = pd.to_numeric(df[col], errors="coerce")

for col in nutrition_cols:
    df[col].fillna(df[col].mean(), inplace=True)

if "Diet_type" in df.columns:
    df["Diet_type"].fillna("Unknown", inplace=True)

if "Cuisine" in df.columns:
    df["Cuisine"].fillna("Unknown", inplace=True)

avg_macros = df.groupby("Diet_type")[nutrition_cols].mean()

print("\nAverage Macronutrients")
print(avg_macros)

avg_macros.to_csv("output/average_macros.csv")

top5 = (
    df.sort_values("Protein(g)", ascending=False)
        .groupby("Diet_type")
        .head(5)
)

print("\nTop Protein Recipes")
print(top5)

top5.to_csv("output/top5_protein.csv", index=False)

highest = df.loc[df["Protein(g)"].idxmax()]

print("\nHighest Protein Recipe")
print(highest)

common_cuisine = (
    df.groupby("Diet_type")["Cuisine_type"]
    .agg(lambda x: x.mode().iat[0] if not x.mode().empty else np.nan) 
)

print("\nMost Common Cuisine")
print(common_cuisine)

common_cuisine.to_csv("output/cuisine_counts.csv")

df["Protein_to_Carbs_ratio"] = (
    df["Protein(g)"] /
    df["Carbs(g)"].replace(0, np.nan)
)

df["Carbs_to_Fat_ratio"] = (
    df["Carbs(g)"] /
    df["Fat(g)"].replace(0, np.nan)
)

df.to_csv("output/cleaned_dataset.csv", index=False)

avg_macros.plot(kind="bar", figsize=(10,6))

plt.title("Average Macronutrients by Diet Type")
plt.ylabel("Grams")
plt.tight_layout()

plt.savefig("output/average_macros.png")
plt.show()

plt.figure(figsize=(8,5))

sns.heatmap(
    avg_macros,
    annot=True,
    cmap="YlGnBu",
    fmt=".1f"
)

plt.title("Macronutrient Heatmap")

plt.tight_layout()

plt.savefig("output/heatmap.png")
plt.show()

plt.figure(figsize=(12,7))

sns.scatterplot(
    data=top5,
    x="Cuisine_type",
    y="Protein(g)",
    hue="Diet_type",
    s=120
)

plt.xticks(rotation=45)

plt.title("Top 5 Protein-rich Recipes by Cuisine")

plt.tight_layout()

plt.savefig("output/protein_scatter.png")

plt.show()

print("\nAnalysis Complete!")
print("Outputs saved inside output/ folder")

