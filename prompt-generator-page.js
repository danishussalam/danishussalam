const WORKER_URL = 'https://prompt-generator.danish-us-salam.workers.dev';

// Device detection
const isMobile = () => window.innerWidth < 768;
const isTablet = () => window.innerWidth >= 768 && window.innerWidth < 1024;
const isDesktop = () => window.innerWidth >= 1024;

// Initialize device-aware UI
window.addEventListener('load', () => {
  optimizeForDevice();
});

window.addEventListener('resize', () => {
  optimizeForDevice();
});

function optimizeForDevice() {
  const device = isMobile() ? 'mobile' : isTablet() ? 'tablet' : 'desktop';
  document.documentElement.setAttribute('data-device', device);

  if (isMobile()) {
    // Mobile-specific optimizations
    document.body.style.fontSize = '14px';
    const frameworkCards = document.querySelectorAll('[class*="bg-blue-300"], [class*="bg-green-300"]');
    frameworkCards.forEach(card => {
      card.style.transform = 'scale(1)';
    });
  }
}

// Speech-to-text setup
//
// Architecture:
// - committedText: all finalised speech, persists across auto-restarts
// - interimText: what the user is currently saying (shown live, not saved)
// - continuous:true is set but Android Chrome still auto-stops on silence,
//   so onend auto-restarts unless stoppedByUser is true
// - The textarea always shows: committedText + " " + interimText
// - On each onresult, we process ONLY event.resultIndex onwards (the delta)
//   to avoid reprocessing results from earlier in the same session

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let stoppedByUser = false;
let isRestarting = false;
let committedText = '';  // finalised text, survives across restarts
let interimText = '';    // live in-progress text, replaced each interim event

function setMicActive(active) {
  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;
  if (active) {
    micBtn.classList.add('bg-red-500', 'text-white');
    micBtn.classList.remove('bg-blue-50', 'text-blue-600');
  } else {
    micBtn.classList.remove('bg-red-500', 'text-white');
    micBtn.classList.add('bg-blue-50', 'text-blue-600');
  }
}

function renderTextarea() {
  const textarea = document.getElementById('raw-prompt');
  if (!textarea) return;
  const base = committedText.trimEnd();
  const live = interimText.trim();
  textarea.value = base + (base && live ? ' ' : '') + live + (live ? ' ' : (base ? ' ' : ''));
  updateGenerateButtonState();
}

function startSession() {
  interimText = '';
  try {
    recognition.start();
  } catch (e) {
    console.error('recognition.start() failed:', e);
    isRestarting = false;
    setMicActive(false);
  }
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;    // keeps session alive on desktop; mobile ignores this
  recognition.interimResults = true; // show words in real time as the user speaks
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    isRestarting = false;
    setMicActive(true);
  };

  recognition.onend = () => {
    isListening = false;
    interimText = ''; // clear any dangling interim on session end
    if (!stoppedByUser) {
      // Mobile auto-stopped due to silence — restart transparently
      isRestarting = true;
      setTimeout(() => {
        if (!stoppedByUser) {
          startSession();
        } else {
          isRestarting = false;
          setMicActive(false);
        }
      }, 100);
    } else {
      isRestarting = false;
      renderTextarea(); // flush final state without interim
      setMicActive(false);
    }
  };

  recognition.onresult = (event) => {
    // Process only the NEW results since the last event (event.resultIndex is the delta start)
    let newFinal = '';
    let newInterim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        newFinal += transcript;
      } else {
        newInterim += transcript;
      }
    }
    if (newFinal) {
      committedText = committedText.trimEnd() + (committedText.trim() ? ' ' : '') + newFinal.trim();
      interimText = ''; // final result clears the interim for that phrase
    }
    if (newInterim) {
      interimText = newInterim; // replace (not append) — interim is always the current live phrase
    }
    renderTextarea();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showError('Microphone error: ' + event.error);
    }
  };
}

function toggleMicrophone() {
  if (!recognition) {
    showError('Speech recognition not supported in your browser. Please use Chrome, Edge, or Safari.');
    return;
  }

  if (isListening || isRestarting) {
    stoppedByUser = true;
    isRestarting = false;
    try { recognition.stop(); } catch (e) { /* already stopped */ }
    setMicActive(false);
  } else {
    // Fresh dictation — reset all state but preserve existing textarea content
    stoppedByUser = false;
    const textarea = document.getElementById('raw-prompt');
    committedText = textarea ? textarea.value.trimEnd() : '';
    interimText = '';
    startSession();
  }
}

// Handle voice file upload and transcription
async function handleVoiceFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  clearMessages();
  showLoading();

  try {
    // Convert audio file to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const audioData = e.target.result;

      // Send to backend for transcription
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transcribe',
          audioData: audioData,
          fileName: file.name
        })
      });

      if (!response.ok) {
        throw new Error('Failed to transcribe audio');
      }

      const data = await response.json();

      if (data.transcript) {
        const textarea = document.getElementById('raw-prompt');
        if (textarea.value && !textarea.value.endsWith(' ')) {
          textarea.value += ' ';
        }
        textarea.value += data.transcript + ' ';
        updateGenerateButtonState();
      } else {
        showError('No speech detected in the audio file. Please try again.');
      }
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error('Voice upload error:', error);
    showError('Error processing audio: ' + error.message);
  } finally {
    hideLoading();
    // Reset file input
    event.target.value = '';
  }
}

// Initialize mic button event listener as backup
document.addEventListener('DOMContentLoaded', function() {
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', toggleMicrophone);
  }

  // Voice upload button handler
  const voiceUploadBtn = document.getElementById('voice-upload-btn');
  const voiceFileInput = document.getElementById('voice-file-input');
  if (voiceUploadBtn && voiceFileInput) {
    voiceUploadBtn.addEventListener('click', function() {
      voiceFileInput.click();
    });
    voiceFileInput.addEventListener('change', handleVoiceFileUpload);
  }
});

const FRAMEWORK_META = {
  'AUTO': {
    label: 'Auto – AI selects the best framework',
    desc: 'Analyses your prompt and selects the most suitable framework automatically.'
  },
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

// Handle framework dropdown change - just update button state
document.addEventListener('DOMContentLoaded', function() {
  const frameworkSelect = document.getElementById('framework-select');
  if (frameworkSelect) {
    frameworkSelect.addEventListener('change', function() {
      // Enable/disable generate button based on framework and text
      updateGenerateButtonState();
    });
  }
});

// Handle raw prompt textarea input
const rawPromptElement = document.getElementById('raw-prompt');
if (rawPromptElement) {
  rawPromptElement.addEventListener('input', function() {
    updateGenerateButtonState();
  });

  // Keyboard shortcut: Ctrl+Enter to generate
  rawPromptElement.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
      if (!document.getElementById('generate-btn').disabled) {
        generatePrompt();
      }
    }
  });
}

// Update generate button state
function updateGenerateButtonState() {
  const framework = document.getElementById('framework-select');
  const rawPrompt = document.getElementById('raw-prompt');
  const btn = document.getElementById('generate-btn');

  if (framework && rawPrompt && btn) {
    btn.disabled = !framework.value || !rawPrompt.value.trim();
  }
}

// Main generate function
async function generatePrompt() {
  const framework = document.getElementById('framework-select').value;
  const rawPrompt = document.getElementById('raw-prompt').value.trim();

  if (!framework || !rawPrompt) {
    showError('Please select a framework and enter your prompt.');
    return;
  }

  // Stop microphone if active when the user triggers generation
  if (isListening && recognition) {
    stoppedByUser = true;
    recognition.stop();
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
    const resultText = data.refinedPrompt;
    document.getElementById('result-prompt').textContent = resultText;

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
  const errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.classList.add('hidden');
  }
}
