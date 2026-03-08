// Cloudflare Worker URL - update this after deployment
const WORKER_URL = "https://search-term-generator.danishussalam.workers.dev";

const questionInput = document.getElementById("question");
const generateBtn = document.getElementById("generate-btn");
const resultsSection = document.getElementById("results-section");
const loadingDiv = document.getElementById("loading");
const errorDiv = document.getElementById("error");

// Event listeners
generateBtn.addEventListener("click", generateSearchTerms);
questionInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && e.ctrlKey) {
    generateSearchTerms();
  }
});

async function generateSearchTerms() {
  const question = questionInput.value.trim();

  if (!question) {
    showError("Please enter a research question.");
    return;
  }

  // Clear previous results and errors
  clearMessages();
  showLoading();
  generateBtn.disabled = true;

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.narrow || !data.balanced || !data.broad) {
      throw new Error("Invalid response format from server.");
    }

    // Display results
    document.getElementById("result-narrow").textContent = data.narrow;
    document.getElementById("result-balanced").textContent = data.balanced;
    document.getElementById("result-broad").textContent = data.broad;

    resultsSection.style.display = "block";
    loadingDiv.style.display = "none";

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Error:", error);
    showError(`Error generating search terms: ${error.message}`);
    loadingDiv.style.display = "none";
  } finally {
    generateBtn.disabled = false;
  }
}

function copyResult(elementId) {
  const element = document.getElementById(elementId);
  const text = element.textContent;

  navigator.clipboard.writeText(text).then(
    () => {
      // Visual feedback
      const button = event.target;
      const originalText = button.textContent;
      button.textContent = "✓ Copied!";
      button.classList.add("bg-green-500", "text-white");
      button.classList.remove("bg-gray-100", "hover:bg-gray-200", "text-gray-900");

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove("bg-green-500", "text-white");
        button.classList.add("bg-gray-100", "hover:bg-gray-200", "text-gray-900");
      }, 2000);
    },
    (err) => {
      showError("Failed to copy to clipboard.");
      console.error("Clipboard error:", err);
    }
  );
}

function showLoading() {
  loadingDiv.style.display = "block";
  resultsSection.style.display = "none";
  errorDiv.style.display = "none";
}

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
  resultsSection.style.display = "none";
  loadingDiv.style.display = "none";
}

function clearMessages() {
  errorDiv.style.display = "none";
  errorDiv.textContent = "";
  loadingDiv.style.display = "none";
}
