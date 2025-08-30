document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM Element References & State ---
    const
        form = document.getElementById('generation-form'),
        userText = document.getElementById('user-text'),
        fileDropZone = document.getElementById('file-drop-zone'),
        fileInput = document.getElementById('file-input'),
        fileInfo = document.getElementById('file-info'),
        fileName = document.getElementById('file-name'),
        removeFileButton = document.getElementById('remove-file-button'),
        llmProvider = document.getElementById('llm-provider'),
        apiKey = document.getElementById('api-key'),
        toggleVisibility = document.getElementById('toggle-visibility'),
        generateBtn = document.getElementById('generate-btn'),
        resultArea = document.getElementById('result-area'),
        statusDisplay = document.getElementById('status-display'),
        resultDisplay = document.getElementById('result-display');

    let state = {
        isProcessing: false,
        uploadedFile: null,
    };

    // --- 2. Core Functions (API, PPTX Generation) ---

    async function callLLM(text, provider, key) {
        const prompt = `Analyze the following text and structure it into a JSON array of slides. Each object must have a 'title' (string) and 'content' (string, formatted with '\\n- ' for bullet points). Output only the raw JSON array. TEXT: """${text}"""`;
        const messages = [{ role: 'user', content: prompt }];
        let apiUrl, headers = { 'Content-Type': 'application/json' }, body;

        switch (provider) {
            case 'openai':
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                headers.Authorization = `Bearer ${key}`;
                body = { model: 'gpt-3.5-turbo', messages, temperature: 0.5 };
                break;
            case 'anthropic':
                apiUrl = 'https://api.anthropic.com/v1/messages';
                headers['x-api-key'] = key;
                headers['anthropic-version'] = '2023-06-01';
                body = { model: "claude-3-haiku-20240307", max_tokens: 4096, messages, temperature: 0.5 };
                break;
            case 'google':
                apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`;
                body = { contents: [{ parts: [{ text: prompt }] }] };
                break;
            default: throw new Error(`Unsupported provider: ${provider}`);
        }
        const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error (${response.status}): ${errText}`);
        }
        return response.json();
    }
    
    function parseAPIResponse(data, provider) {
        try {
            let jsonString;
            switch (provider) {
                case 'openai': jsonString = data.choices[0].message.content; break;
                case 'anthropic': jsonString = data.content[0].text; break;
                case 'google': jsonString = data.candidates[0].content.parts[0].text; break;
                default: throw new Error("Unknown provider.");
            }
            const startIndex = jsonString.indexOf('[');
            const endIndex = jsonString.lastIndexOf(']');
            return jsonString.substring(startIndex, endIndex + 1);
        } catch (e) {
            throw new Error("Could not parse AI response. It might be an invalid format.");
        }
    }

    async function generatePresentation(slidesData) {
        let pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';

        slidesData.forEach(slideContent => {
            let slide = pptx.addSlide();
            slide.addText(slideContent.title || 'Untitled Slide', { x: 0.5, y: 0.25, w: '90%', h: 1, fontSize: 32, bold: true, color: '363636' });
            slide.addText(slideContent.content || '', { x: 0.5, y: 1.5, w: '90%', h: 3.75, fontSize: 18, color: '363636', bullet: true });
        });
        
        await pptx.writeFile({ fileName: 'SlideCraft_Presentation.pptx' });
    }

    // --- 3. UI Update Functions ---

    function updateUI() {
        // Enable/disable the generate button based on form validity
        generateBtn.disabled = !form.checkValidity() || !state.uploadedFile || state.isProcessing;

        // Update button text during processing
        const btnText = generateBtn.querySelector('span');
        if (btnText) {
            btnText.textContent = state.isProcessing ? 'Generating...' : 'Generate Presentation';
        }
    }

    function renderStatus(message, type = 'pending') {
        const iconClass = {
            pending: 'fas fa-spinner',
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-triangle'
        }[type];
        
        const item = document.createElement('div');
        item.className = `status-item ${type}`;
        item.innerHTML = `<i class="icon ${iconClass}"></i><span>${message}</span>`;
        statusDisplay.appendChild(item);
    }
    
    function renderResult(summary, isSuccess) {
        resultDisplay.innerHTML = '';
        if (isSuccess) {
            const summaryEl = document.createElement('p');
            summaryEl.id = 'result-summary';
            summaryEl.textContent = summary;
            
            const downloadBtn = document.createElement('button');
            downloadBtn.id = 'download-btn';
            downloadBtn.className = 'btn btn-primary';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> <span>Download Again</span>';
            // Note: In a real app, this would re-trigger the download from saved data,
            // here it's just a placeholder as the file is already downloaded.

            resultDisplay.appendChild(summaryEl);
            // resultDisplay.appendChild(downloadBtn); // Optional re-download
        } else {
             const errorEl = document.createElement('p');
             errorEl.id = 'result-summary';
             errorEl.style.color = 'var(--error-color)';
             errorEl.textContent = summary;
             resultDisplay.appendChild(errorEl);
        }
        
        const startOverBtn = document.createElement('button');
        startOverBtn.id = 'start-over-btn';
        startOverBtn.className = 'btn';
        startOverBtn.innerHTML = '<i class="fas fa-redo"></i> <span>Start Over</span>';
        startOverBtn.onclick = resetApp;
        resultDisplay.appendChild(startOverBtn);

        resultDisplay.style.display = 'block';
    }

    function resetApp() {
        form.reset();
        state.uploadedFile = null;
        fileInfo.style.display = 'none';
        fileDropZone.style.display = 'block';
        resultArea.style.display = 'none';
        statusDisplay.innerHTML = '';
        resultDisplay.innerHTML = '';
        state.isProcessing = false;
        loadSettings(); // Reload saved API key
        updateUI();
    }
    
    // --- 4. Event Handlers & Initialization ---

    function handleFile(file) {
        if (file && (file.name.endsWith('.pptx') || file.name.endsWith('.potx'))) {
            state.uploadedFile = file;
            fileName.textContent = file.name;
            fileDropZone.style.display = 'none';
            fileInfo.style.display = 'flex';
        } else {
            // This is a user-friendly way to handle invalid files.
            fileInput.value = ''; // Reset the input so they can select again
            alert('Invalid file type. Please upload a .pptx or .potx file.');
        }
        updateUI();
    }
    
    async function handleSubmit(e) {
        e.preventDefault();
        if (state.isProcessing) return;

        state.isProcessing = true;
        resultArea.style.display = 'block';
        resultDisplay.style.display = 'none';
        statusDisplay.innerHTML = '';
        updateUI();

        try {
            renderStatus('Calling AI to structure content...', 'pending');
            const apiResponse = await callLLM(userText.value, llmProvider.value, apiKey.value);
            
            renderStatus('Parsing AI response...', 'pending');
            const jsonString = parseAPIResponse(apiResponse, llmProvider.value);
            const slidesData = JSON.parse(jsonString);
            if (!Array.isArray(slidesData) || slidesData.length === 0) throw new Error("AI returned no slide data.");
            
            renderStatus(`Building ${slidesData.length} slides...`, 'pending');
            await generatePresentation(slidesData);

            // Final Success State
            statusDisplay.innerHTML = '';
            renderStatus('Presentation Generated Successfully!', 'success');
            renderResult(`Your presentation with ${slidesData.length} slides is ready.`, true);

        } catch (error) {
            console.error('Generation Failed:', error);
            statusDisplay.innerHTML = '';
            renderStatus('An error occurred during generation.', 'error');
            renderResult(`Error: ${error.message}`, false);
        } finally {
            state.isProcessing = false;
            updateUI();
        }
    }
    
    function saveSettings() {
        localStorage.setItem('slidecraft_api_key', apiKey.value);
        localStorage.setItem('slidecraft_provider', llmProvider.value);
    }
    
    function loadSettings() {
        apiKey.value = localStorage.getItem('slidecraft_api_key') || '';
        llmProvider.value = localStorage.getItem('slidecraft_provider') || 'openai';
        updateUI();
    }

    // --- 5. Initial Setup ---
    form.addEventListener('submit', handleSubmit);
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    removeFileButton.addEventListener('click', () => {
        state.uploadedFile = null;
        fileInput.value = '';
        fileInfo.style.display = 'none';
        fileDropZone.style.display = 'block';
        updateUI();
    });
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => fileDropZone.addEventListener(eventName, () => fileDropZone.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(eventName => fileDropZone.addEventListener(eventName, () => fileDropZone.classList.remove('dragover')));
    fileDropZone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

    apiKey.addEventListener('input', saveSettings);
    llmProvider.addEventListener('change', saveSettings);
    [userText, apiKey].forEach(el => el.addEventListener('input', updateUI));
    toggleVisibility.addEventListener('click', () => {
        apiKey.type = apiKey.type === 'password' ? 'text' : 'password';
        toggleVisibility.querySelector('i').classList.toggle('fa-eye-slash');
    });

    loadSettings(); // Load saved settings on startup
});