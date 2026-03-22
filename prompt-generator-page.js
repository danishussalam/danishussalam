const WORKER_URL = 'https://prompt-generator.danish-us-salam.workers.dev';

// Speech-to-text setup
let isListening = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('mic-btn').classList.add('bg-red-500', 'text-white');
    document.getElementById('mic-btn').classList.remove('bg-du-blue/10', 'text-du-blue');
    document.getElementById('mic-text').textContent = 'Listening...';
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById('mic-btn').classList.remove('bg-red-500', 'text-white');
    document.getElementById('mic-btn').classList.add('bg-du-blue/10', 'text-du-blue');
    document.getElementById('mic-text').textContent = 'Speak';
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        // Add space between sentences
        transcript += ' ';
      }
    }

    const textarea = document.getElementById('raw-prompt');
    if (textarea.value && !textarea.value.endsWith(' ')) {
      textarea.value += ' ';
    }
    textarea.value += transcript;

    // Update button state
    updateGenerateButtonState();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    showError('Microphone error: ' + event.error);
  };
}

function toggleMicrophone() {
  if (!recognition) {
    showError('Speech recognition not supported in your browser. Please use Chrome, Edge, or Safari.');
    return;
  }

  try {
    if (isListening) {
      recognition.stop();
    } else {
      const textarea = document.getElementById('raw-prompt');
      textarea.focus();
      recognition.start();
    }
  } catch (error) {
    console.error('Microphone error:', error);
    showError('Microphone access error. Please check your browser permissions.');
  }
}

// Initialize mic button event listener as backup
document.addEventListener('DOMContentLoaded', function() {
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', toggleMicrophone);
  }
});

const FRAMEWORK_META = {
  'ROSE': {
    label: 'Role, Objective, Style, Exemplar',
    desc: 'Specify a clear role for the AI, define your objective precisely, set the style or tone, and include a worked example.'
  },
  'APE': {
    label: 'Action, Purpose, Expectation',
    desc: 'Focus on the action you want, the purpose behind it, and what success looks like.'
  },
  'RACE': {
    label: 'Role, Action, Context, Expectation',
    desc: 'Ground your request in a realistic scenario, define roles and actions, and set clear expectations.'
  },
  'RISE': {
    label: 'Role, Input, Steps, Expectation',
    desc: 'Break down multi-step tasks into a sequence of steps with clear inputs and role definition.'
  },
  'RTF': {
    label: 'Role, Task, Format',
    desc: 'Keep it concise: define the role, specify the task, and describe the output format.'
  },
  'COSTAR': {
    label: 'Context, Objective, Style, Tone, Audience, Response',
    desc: 'Comprehensive framework: context, objective, style, tone, target audience, and response format.'
  },
  'COT': {
    label: 'Chain of Thought',
    desc: 'Instruct the AI to think step-by-step before answering, breaking down complex reasoning.'
  },
  'CRISPE': {
    label: 'Capacity, Role, Insight, Statement, Personality, Experiment',
    desc: 'Creative framework emphasising role-play, insight, personality, and experimental thinking.'
  },
  'FEWSHOT': {
    label: 'Few-Shot (Examples-based Prompting)',
    desc: 'Teach the AI through 2-3 examples of the desired output, rather than lengthy instructions.'
  },
  'REACT': {
    label: 'ReAct (Reasoning + Acting)',
    desc: 'Sequence reasoning and action for multi-step tasks that require planning and execution.'
  },
  'HYBRID': {
    label: 'Hybrid (Multi-framework Combination)',
    desc: 'Intelligently combine 2-4 frameworks based on your task complexity and needs.'
  }
};

// Handle framework dropdown change
document.getElementById('framework-select').addEventListener('change', function() {
  const selectedFramework = this.value;
  const descPanel = document.getElementById('framework-desc');

  if (selectedFramework && FRAMEWORK_META[selectedFramework]) {
    const meta = FRAMEWORK_META[selectedFramework];
    descPanel.innerHTML = `
      <span class="font-semibold text-gray-900">${meta.label}</span><br/>
      <span class="text-gray-600">${meta.desc}</span>
    `;
    descPanel.classList.remove('hidden');
  } else {
    descPanel.classList.add('hidden');
  }

  // Enable/disable generate button based on framework and text
  updateGenerateButtonState();
});

// Handle raw prompt textarea input
document.getElementById('raw-prompt').addEventListener('input', function() {
  updateGenerateButtonState();
});

// Update generate button state
function updateGenerateButtonState() {
  const framework = document.getElementById('framework-select').value;
  const rawPrompt = document.getElementById('raw-prompt').value.trim();
  const btn = document.getElementById('generate-btn');

  btn.disabled = !framework || !rawPrompt;
}

// Keyboard shortcut: Ctrl+Enter to generate
document.getElementById('raw-prompt').addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && e.ctrlKey) {
    if (!document.getElementById('generate-btn').disabled) {
      generatePrompt();
    }
  }
});

// Main generate function
async function generatePrompt() {
  const framework = document.getElementById('framework-select').value;
  const rawPrompt = document.getElementById('raw-prompt').value.trim();

  if (!framework || !rawPrompt) {
    showError('Please select a framework and enter your prompt.');
    return;
  }

  clearMessages();
  showLoading();
  document.getElementById('generate-btn').disabled = true;

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framework, rawPrompt })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate refined prompt');
    }

    const data = await response.json();

    if (!data.refinedPrompt) {
      throw new Error('No refined prompt in response');
    }

    // Display result
    document.getElementById('result-prompt').textContent = data.refinedPrompt;
    document.getElementById('framework-name').textContent = FRAMEWORK_META[framework].label;
    document.getElementById('results-section').classList.remove('hidden');

    // Smooth scroll to results
    setTimeout(() => {
      document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    }, 100);

  } catch (error) {
    showError(error.message || 'An error occurred. Please try again.');
  } finally {
    hideLoading();
    document.getElementById('generate-btn').disabled = false;
  }
}

// Copy result to clipboard
function copyResult() {
  const resultText = document.getElementById('result-prompt').textContent;
  navigator.clipboard.writeText(resultText).then(() => {
    const btn = document.getElementById('copy-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    showError('Failed to copy to clipboard');
  });
}

// UI helpers
function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function showError(message) {
  const errorDiv = document.getElementById('error');
  document.getElementById('error-text').textContent = message;
  errorDiv.classList.remove('hidden');
}

function clearMessages() {
  document.getElementById('error').classList.add('hidden');
  document.getElementById('results-section').classList.add('hidden');
}
