/* =========================================
   NUTRISCOPE
   NUTRITIONAL INSIGHTS DASHBOARD
========================================= */


/* =========================================
   1. APPLICATION CONFIGURATION
========================================= */

const CONFIG = window.DASHBOARD_CONFIG || {
    API_URL: "",
    DEMO_MODE: true,
    DEMO_DATA_URL: "./demo-data.json",
    REQUEST_TIMEOUT: 30000
};


/* =========================================
   2. GLOBAL VARIABLES
========================================= */

// Stores the nutritional data returned by
// either the local JSON file or Azure Function.

let dashboardData = null;

// Stores the Chart.js chart instances.

let macroChart = null;
let distributionChart = null;
let scatterChart = null;


/* =========================================
   3. DOM ELEMENT REFERENCES
========================================= */

const elements = {

    totalRecipes:
        document.getElementById("totalRecipes"),

    highestProteinDiet:
        document.getElementById("highestProteinDiet"),

    highestProteinValue:
        document.getElementById("highestProteinValue"),

    executionTime:
        document.getElementById("executionTime"),

    missingValues:
        document.getElementById("missingValues"),

    dietFilter:
        document.getElementById("dietFilter"),

    refreshButton:
        document.getElementById("refreshButton"),

    connectionStatus:
        document.getElementById("connectionStatus"),

    datasetName:
        document.getElementById("datasetName"),

    lastUpdated:
        document.getElementById("lastUpdated"),

    dataSource:
        document.getElementById("dataSource"),

    environment:
        document.getElementById("environment"),

    errorMessage:
        document.getElementById("errorMessage"),

    recipeTableBody:
        document.getElementById("recipeTableBody")

};


/* =========================================
   4. INITIALIZE DASHBOARD
========================================= */

document.addEventListener("DOMContentLoaded", () => {

    console.log("NutriScope dashboard initialized.");

    // Check whether Chart.js loaded successfully.

    if (typeof Chart === "undefined") {

        showError(
            "Chart.js could not be loaded. " +
            "Please check your internet connection."
        );

        return;
    }

    // Register dashboard event listeners.

    elements.refreshButton.addEventListener(
        "click",
        loadDashboardData
    );

    elements.dietFilter.addEventListener(
        "change",
        handleDietFilter
    );

    // Load the initial nutritional data.

    loadDashboardData();

});


/* =========================================
   5. LOAD DASHBOARD DATA
========================================= */

async function loadDashboardData() {

    try {

        // Prevent multiple simultaneous refreshes.

        elements.refreshButton.disabled = true;

        elements.refreshButton.textContent =
            "Loading...";

        elements.connectionStatus.textContent =
            "Connecting...";

        hideError();

        let data;

        // DEMO MODE

        if (CONFIG.DEMO_MODE) {

            data = await fetchDemoData();

            elements.connectionStatus.textContent =
                "DEMO MODE";

            elements.environment.textContent =
                "Local Preview";

            elements.dataSource.textContent =
                "Local JSON File";

        }

        // CLOUD MODE

        else {

            data = await fetchAzureData();

            elements.connectionStatus.textContent =
                "AZURE CONNECTED";

            elements.environment.textContent =
                "Azure Cloud";

            elements.dataSource.textContent =
                "Azure Blob Storage";
        }

        // Validate the response.

        validateDashboardData(data);

        // Store the data globally.

        dashboardData = data;

        // Populate the diet dropdown.

        populateDietFilter();

        // Update dashboard information.

        updateDashboard(data);

        // Generate all charts.

        renderCharts();

        // Display the recipe table.

        renderRecipeTable();

        console.log(
            "Dashboard data loaded successfully.",
            data
        );

    }

    catch (error) {

        console.error(
            "Dashboard loading failed:",
            error
        );

        elements.connectionStatus.textContent =
            "CONNECTION ERROR";

        showError(error.message);

    }

    finally {

        elements.refreshButton.disabled = false;

        elements.refreshButton.textContent =
            "Refresh Data";

    }

}


/* =========================================
   6. LOAD LOCAL DEMO DATA
========================================= */

async function fetchDemoData() {

    const response = await fetch(
        CONFIG.DEMO_DATA_URL
    );

    if (!response.ok) {

        throw new Error(
            "Unable to load demo-data.json."
        );

    }

    return await response.json();

}


/* =========================================
   7. LOAD DATA FROM AZURE FUNCTION
========================================= */

async function fetchAzureData() {

    if (!CONFIG.API_URL) {

        throw new Error(
            "Azure Function API URL is not configured."
        );

    }

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.REQUEST_TIMEOUT || 30000
    );

    try {

        const response = await fetch(
            CONFIG.API_URL,
            {
                method: "GET",

                headers: {
                    "Accept": "application/json"
                },

                signal: controller.signal
            }
        );

        if (!response.ok) {

            throw new Error(
                `Azure Function returned HTTP ${response.status}.`
            );

        }

        return await response.json();

    }

    catch (error) {

        if (error.name === "AbortError") {

            throw new Error(
                "The Azure Function request timed out."
            );

        }

        throw error;

    }

    finally {

        clearTimeout(timeout);

    }

}


/* =========================================
   8. VALIDATE JSON RESPONSE
========================================= */

function validateDashboardData(data) {

    if (!data || typeof data !== "object") {

        throw new Error(
            "Invalid dashboard response."
        );

    }

    const requiredProperties = [

        "metadata",

        "diet_types",

        "averages_by_diet",

        "recipe_counts_by_diet",

        "top_protein_recipes",

        "highest_protein_diet",

        "most_common_cuisine_by_diet"

    ];

    for (const property of requiredProperties) {

        if (!(property in data)) {

            throw new Error(
                `Missing required JSON property: ${property}`
            );

        }

    }

    if (

        !Array.isArray(data.diet_types) ||

        !Array.isArray(data.averages_by_diet) ||

        !Array.isArray(data.recipe_counts_by_diet) ||

        !Array.isArray(data.top_protein_recipes)

    ) {

        throw new Error(
            "Dashboard data contains invalid arrays."
        );

    }

}


/* =========================================
   9. POPULATE DIET FILTER
========================================= */

function populateDietFilter() {

    const previousValue =
        elements.dietFilter.value || "all";

    elements.dietFilter.innerHTML = "";

    const allOption = document.createElement("option");

    allOption.value = "all";

    allOption.textContent = "All Diet Types";

    elements.dietFilter.appendChild(allOption);

    dashboardData.diet_types.forEach(diet => {

        const option = document.createElement("option");

        option.value = diet;

        option.textContent = formatDietName(diet);

        elements.dietFilter.appendChild(option);

    });

    const previousStillExists = [
        ...elements.dietFilter.options
    ].some(option => option.value === previousValue);

    elements.dietFilter.value =
        previousStillExists ? previousValue : "all";

}


/* =========================================
   10. UPDATE SUMMARY CARDS
========================================= */

function updateDashboard(data) {

    const metadata = data.metadata;

    const selectedDiet =
        elements.dietFilter.value;

    // Get total recipe count.

    let totalRecipes =
        metadata.total_recipes || 0;

    // Display selected diet recipe count
    // when a filter is applied.

    if (selectedDiet !== "all") {

        const selectedCount =
            data.recipe_counts_by_diet.find(
                item => item.diet_type === selectedDiet
            );

        totalRecipes =
            selectedCount?.recipe_count || 0;

    }

    elements.totalRecipes.textContent =
        Number(totalRecipes).toLocaleString();


    // Highest protein diet.

    const highestProtein =
        data.highest_protein_diet;

    if (highestProtein) {

        elements.highestProteinDiet.textContent =
            formatDietName(highestProtein.diet_type || "N/A");

        elements.highestProteinValue.textContent =
            `Average protein: ${
                formatNumber(highestProtein.average_protein_g)
            } g`;

    }


    // Backend execution time.

    const executionTime =
        metadata.execution_time_ms;

    elements.executionTime.textContent =
        executionTime === null ||
        executionTime === undefined
            ? "Preview"
            : `${formatNumber(executionTime)} ms`;


    // Missing nutritional values.

    elements.missingValues.textContent =
        Number(
            metadata.missing_macro_values_filled || 0
        ).toLocaleString();


    // Dataset information.

    elements.datasetName.textContent =
        metadata.dataset || "All_Diets.csv";


    // Last updated.

    const generatedAt =
        metadata.generated_at_utc;

    elements.lastUpdated.textContent =
        generatedAt
            ? formatDate(generatedAt)
            : "Not available";

}


/* =========================================
   11. HANDLE DIET FILTER
========================================= */

function handleDietFilter() {

    if (!dashboardData) {
        return;
    }

    // Update summary information.

    updateDashboard(dashboardData);

    // Refresh charts using the selected diet.

    renderCharts();

    // Refresh recipe information.

    renderRecipeTable();

}


/* =========================================
   12. GET FILTERED DATA
========================================= */

function getFilteredData() {

    const selectedDiet =
        elements.dietFilter.value;

    const isAll =
        selectedDiet === "all";

    const averages =
        dashboardData.averages_by_diet.filter(item => {

            return isAll ||
                item.diet_type === selectedDiet;

        });

    const recipes =
        dashboardData.top_protein_recipes.filter(item => {

            return isAll ||
                item.diet_type === selectedDiet;

        });

    return {
        averages,
        recipes
    };

}


/* =========================================
   13. RENDER ALL CHARTS
========================================= */

function renderCharts() {

    if (!dashboardData) {
        return;
    }

    const filtered =
        getFilteredData();

    renderMacroChart(
        filtered.averages
    );

    renderDistributionChart();

    renderScatterChart(
        filtered.recipes
    );

}


/* =========================================
   14. BAR CHART
   AVERAGE MACRONUTRIENTS
========================================= */

function renderMacroChart(data) {

    const context =
        document.getElementById("macroChart");

    if (macroChart) {

        macroChart.destroy();

    }

    const labels = data.map(
        item => formatDietName(item.diet_type)
    );

    macroChart = new Chart(context, {

        type: "bar",

        data: {

            labels,

            datasets: [

                {
                    label: "Protein (g)",

                    data: data.map(
                        item => item.protein_g
                    ),

                    backgroundColor: "#2563eb"
                },

                {
                    label: "Carbohydrates (g)",

                    data: data.map(
                        item => item.carbs_g
                    ),

                    backgroundColor: "#16a34a"
                },

                {
                    label: "Fat (g)",

                    data: data.map(
                        item => item.fat_g
                    ),

                    backgroundColor: "#f59e0b"
                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {

                legend: {
                    position: "top"
                },

                tooltip: {

                    callbacks: {

                        label: function(context) {

                            return (
                                `${context.dataset.label}: ` +
                                `${formatNumber(context.parsed.y)} g`
                            );

                        }

                    }

                }

            },

            scales: {

                y: {

                    beginAtZero: true,

                    title: {
                        display: true,
                        text: "Average Nutritional Content (g)"
                    }

                }

            }

        }

    });

}


/* =========================================
   15. DOUGHNUT CHART
   RECIPE DISTRIBUTION
========================================= */

function renderDistributionChart() {

    const context =
        document.getElementById("distributionChart");

    if (distributionChart) {

        distributionChart.destroy();

    }

    const data =
        dashboardData.recipe_counts_by_diet;

    const labels = data.map(
        item => formatDietName(item.diet_type)
    );

    const counts = data.map(
        item => item.recipe_count
    );

    distributionChart = new Chart(context, {

        type: "doughnut",

        data: {

            labels,

            datasets: [

                {

                    label: "Recipes",

                    data: counts,

                    backgroundColor: [

                        "#2563eb",

                        "#16a34a",

                        "#f59e0b",

                        "#8b5cf6",

                        "#ec4899",

                        "#0891b2"

                    ],

                    borderWidth: 2,

                    borderColor: "#ffffff"

                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            cutout: "62%",

            plugins: {

                legend: {

                    position: "bottom"

                },

                tooltip: {

                    callbacks: {

                        label: function(context) {

                            return (
                                `${context.label}: ` +
                                `${context.parsed.toLocaleString()} recipes`
                            );

                        }

                    }

                }

            }

        }

    });

}


/* =========================================
   16. SCATTER PLOT
   PROTEIN VS CARBOHYDRATES
========================================= */

function renderScatterChart(recipes) {

    const context =
        document.getElementById("scatterChart");

    if (scatterChart) {

        scatterChart.destroy();

    }

    const dietColors = {

        "dash": "#2563eb",

        "keto": "#16a34a",

        "mediterranean": "#f59e0b",

        "paleo": "#8b5cf6",

        "vegan": "#ec4899"

    };

    // Group points by diet type.

    const groups = {};

    recipes.forEach(recipe => {

        const diet = recipe.diet_type;

        if (!groups[diet]) {

            groups[diet] = [];

        }

        groups[diet].push({

            x: Number(recipe.carbs_g),

            y: Number(recipe.protein_g),

            recipeName: recipe.recipe_name,

            cuisineType: recipe.cuisine_type,

            dietType: diet,

            fat: recipe.fat_g

        });

    });

    // Create one dataset per diet type.

    const datasets = Object.entries(groups).map(
        ([diet, points]) => {

            return {

                label: formatDietName(diet),

                data: points,

                backgroundColor:
                    dietColors[diet.toLowerCase()] || "#64748b",

                pointRadius: 6,

                pointHoverRadius: 9

            };

        }
    );

    scatterChart = new Chart(context, {

        type: "scatter",

        data: {
            datasets
        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

                legend: {
                    position: "bottom"
                },

                tooltip: {

                    callbacks: {

                        title: function(items) {

                            return items[0].raw.recipeName;

                        },

                        label: function(context) {

                            const point = context.raw;

                            return [

                                `Diet: ${formatDietName(point.dietType)}`,

                                `Cuisine: ${point.cuisineType}`,

                                `Protein: ${formatNumber(point.y)} g`,

                                `Carbohydrates: ${formatNumber(point.x)} g`,

                                `Fat: ${formatNumber(point.fat)} g`

                            ];

                        }

                    }

                }

            },

            scales: {

                x: {

                    title: {

                        display: true,

                        text: "Carbohydrates (g)"

                    },

                    beginAtZero: true

                },

                y: {

                    title: {

                        display: true,

                        text: "Protein (g)"

                    },

                    beginAtZero: true

                }

            }

        }

    });

}


/* =========================================
   17. RECIPE TABLE
========================================= */

function renderRecipeTable() {

    const { recipes } =
        getFilteredData();

    const sortedRecipes = [...recipes].sort(
        (a, b) => b.protein_g - a.protein_g
    );

    if (sortedRecipes.length === 0) {

        elements.recipeTableBody.innerHTML = `

            <tr>

                <td colspan="6" class="empty-table">

                    No recipes available for this diet type.

                </td>

            </tr>

        `;

        return;

    }

    elements.recipeTableBody.innerHTML =
        sortedRecipes.map(recipe => {

            return `

                <tr>

                    <td>
                        ${escapeHTML(recipe.recipe_name)}
                    </td>

                    <td>
                        ${escapeHTML(
                            formatDietName(recipe.diet_type)
                        )}
                    </td>

                    <td>
                        ${escapeHTML(recipe.cuisine_type || "Unknown")}
                    </td>

                    <td>
                        ${formatNumber(recipe.protein_g)}
                    </td>

                    <td>
                        ${formatNumber(recipe.carbs_g)}
                    </td>

                    <td>
                        ${formatNumber(recipe.fat_g)}
                    </td>

                </tr>

            `;

        }).join("");

}


/* =========================================
   18. FORMAT DIET NAMES
========================================= */

function formatDietName(value) {

    if (!value) {
        return "Unknown";
    }

    return String(value)
        .trim()
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());

}


/* =========================================
   19. FORMAT NUMBERS
========================================= */

function formatNumber(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toFixed(2);

}


/* =========================================
   20. FORMAT DATES
========================================= */

function formatDate(value) {

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {

        return "Invalid date";

    }

    return date.toLocaleString();

}


/* =========================================
   21. ESCAPE HTML
========================================= */

function escapeHTML(value) {

    return String(value ?? "").replace(
        /[&<>"']/g,
        character => {

            const entities = {

                "&": "&amp;",

                "<": "&lt;",

                ">": "&gt;",

                '"': "&quot;",

                "'": "&#39;"

            };

            return entities[character];

        }
    );

}


/* =========================================
   22. DISPLAY ERRORS
========================================= */

function showError(message) {

    elements.errorMessage.textContent =
        message;

    elements.errorMessage.hidden = false;

}


function hideError() {

    elements.errorMessage.textContent = "";

    elements.errorMessage.hidden = true;

}
