/**
 * THE VAULT: ESCAPE ROOM INTERACTIVO (8 SECTORES)
 * Motor de Juego Completo:
 * - Selección manual de objetos del inventario para desbloquear puzles y altares
 * - Inventario infinito y deslizable horizontalmente (Swipe / Touch scroll)
 * - Inventario inteligente (Lectura de documentos vs Selección de ingredientes)
 * - Notificaciones HUD Toast Singleton Antispam (no saturan ni tapan controles)
 * - Puzles 100% matemáticamente solubles (Lights Out y Tuberías corregidos)
 * - Exploración y navegación libre de salas 1 a 8 desde el inicio
 */

// ==========================================
// 1. CONSTANTES, AUDIO Y ESTADO GLOBAL
// ==========================================
const SAVE_KEY = 'THE_VAULT_SAVE_DATA_V11';

// Sistema de Audio Sintetizado (Web Audio API)
class SoundFX {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.12) {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn('Audio no disponible:', e);
        }
    }

    click() { this.playTone(850, 'triangle', 0.04, 0.08); }
    beep(freq = 600) { this.playTone(freq, 'sine', 0.1, 0.1); }
    gear() { this.playTone(180, 'square', 0.06, 0.05); }
    itemPickup() {
        this.playTone(520, 'sine', 0.08, 0.1);
        setTimeout(() => this.playTone(780, 'sine', 0.15, 0.12), 70);
    }
    error() {
        this.playTone(130, 'sawtooth', 0.22, 0.15);
        setTimeout(() => this.playTone(110, 'sawtooth', 0.22, 0.15), 110);
    }
    success() {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            setTimeout(() => this.playTone(freq, 'sine', 0.18, 0.12), idx * 80);
        });
    }
    victoryFanfare() {
        const fanfare = [
            { f: 523.25, d: 0.15 }, { f: 659.25, d: 0.15 },
            { f: 783.99, d: 0.15 }, { f: 1046.5, d: 0.35 },
            { f: 880.00, d: 0.2 },  { f: 1046.5, d: 0.6 }
        ];
        let delay = 0;
        fanfare.forEach(item => {
            setTimeout(() => this.playTone(item.f, 'sine', item.d, 0.15), delay);
            delay += item.d * 1000 + 40;
        });
    }
}

const sfx = new SoundFX();

// Diccionario de Objetos y Recetas
const ITEMS = {
    'cable_rojo': { 
        name: 'Cable de Cobre', 
        icon: '🧵', 
        desc: 'Un tramo de cable conductor de cobre sin terminal.' 
    },
    'conector': { 
        name: 'Conector Rápido', 
        icon: '🔌', 
        desc: 'Un terminal metálico de empalme rápido.' 
    },
    'cable_reparado': { 
        name: 'Cable Aislado', 
        icon: '⚡', 
        desc: 'Cable conductor preparado con aislamiento y terminal para cerrar circuitos.' 
    },
    'partitura_digital': { 
        name: 'Partitura Digital', 
        icon: '📜', 
        desc: 'Registro de frecuencias armónicas: [ DO - MI - SOL - LA - SI ].' 
    },
    'llave_valvula': { 
        name: 'Llave de Válvula', 
        icon: '🗝️', 
        desc: 'Herramienta de acero para desbloquear pasos mecánicos de fluido.' 
    },
    'refrigerante_criogenico': { 
        name: 'Cápsula de Refrigerante', 
        icon: '🧪', 
        desc: 'Cilindro térmico presurizado con nitrógeno líquido a -196°C.' 
    },
    'chip_vigilancia': { 
        name: 'Chip Desencriptador', 
        icon: '💾', 
        desc: 'Módulo electrónico con firmware de desencriptación de protocolos.' 
    },
    'fusible_alta_tension': { 
        name: 'Fusible Crítico', 
        icon: '🔋', 
        desc: 'Fusible cerámico de alta potencia intacto.' 
    },

    // Núcleos de Energía (1 a 7)
    'core_1': { name: 'Núcleo Alfa', icon: '🔮', desc: 'Núcleo de energía 1/7 obtenido del Cofre de Acero.' },
    'core_2': { name: 'Núcleo Beta', icon: '💎', desc: 'Núcleo de energía 2/7 obtenido del Cuadro de Circuitos.' },
    'core_3': { name: 'Núcleo Gamma', icon: '🧩', desc: 'Núcleo de energía 3/7 obtenido de la Caja Fuerte V3.' },
    'core_4': { name: 'Núcleo Delta', icon: '🎹', desc: 'Núcleo de energía 4/7 obtenido del Sintetizador Modular.' },
    'core_5': { name: 'Núcleo Épsilon', icon: '🌀', desc: 'Núcleo de energía 5/7 obtenido de la Consola de Tuberías.' },
    'core_6': { name: 'Núcleo Zeta', icon: '🛰️', desc: 'Núcleo de energía 6/7 obtenido de la Consola de Vigilancia.' },
    'core_7': { name: 'Núcleo Omega', icon: '❄️', desc: 'Núcleo de energía 7/7 obtenido de la Matriz de Soporte Vital.' }
};

const RECIPES = [
    { ingredients: ['cable_rojo', 'conector'], result: 'cable_reparado' }
];

// Nombres de los sectores
const ROOM_NAMES = {
    1: 'Taller de Control',
    2: 'Laboratorio Eléctrico',
    3: 'Archivo de Cifrados',
    4: 'Estudio Acústico',
    5: 'Planta de Fluidos',
    6: 'Centro de Vigilancia',
    7: 'Cámara Criogénica',
    8: 'La Bóveda Principal'
};

// Soluciones fijas de los puzles
const PUZZLE_SOLUTIONS = {
    wordlock: 'SAWS',
    circuitSwitches: [true, false, true, true],
    safeCode: '8492',
    synthSequence: ['DO', 'MI', 'SOL', 'LA', 'SI'],
    pipesValidRotations: {
        1: [0, 2], // horizontal ━
        2: [2],    // ┓ (conecta izquierda con abajo)
        5: [1, 3]  // vertical ┃ (conecta arriba con salida)
    },
    codebreakerSequence: ['🔴', '🟡', '🔵', '🟣'],
    masterCode: '7492618'
};

// Estado Reactivo del Juego
let gameState = {
    currentRoom: 1,
    inventory: [],
    selectedForCombine: [],
    placedCores: [false, false, false, false, false, false, false],
    unlockedDevices: {
        circuit: false,
        synth: false,
        pipes: false,
        codebreaker: false,
        lights: false
    },
    solvedPuzzles: {
        wordlock: false,
        circuit: false,
        safe: false,
        synth: false,
        pipes: false,
        codebreaker: false,
        lights: false,
        masterDoor: false
    },
    collectedHotspots: [],
    codexFragments: ['?', '?', '?', '?', '?', '?', '?'],
    timeElapsed: 0,
    hintsUsed: 0,
    gameStarted: false,
    gameWon: false
};

// Variables volátiles de interfaz
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
let currentWheelIndices = [0, 0, 0, 0];
let circuitSwitches = [false, false, false, false];
let currentSafeInput = '';
let currentSynthInput = [];
let pipeRotations = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const MASTERMIND_SYMBOLS = ['🔴', '🟡', '🟢', '🔵', '🟣', '⚪'];
let currentMastermindGuess = ['🔴', '🔴', '🔴', '🔴'];
let mastermindAttempts = 0;
let lightsGridState = Array(16).fill(false);
let masterWheelValues = [0, 0, 0, 0, 0, 0, 0];
let pendingInspectItem = null;
let currentItemSelectionTarget = null;
let gameTimerInterval = null;

// ==========================================
// 2. INICIALIZACIÓN Y EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkSavedGame();
    initLightsGrid();
    setupEventListeners();
    ensureItemSelectionModalExists();
});

function checkSavedGame() {
    const saved = localStorage.getItem(SAVE_KEY);
    const continueBtn = document.getElementById('btn-continue');
    const warning = document.getElementById('existing-save-warning');
    if (saved) {
        if (continueBtn) continueBtn.classList.remove('hidden');
        if (warning) warning.classList.remove('hidden');
    }
}

function startTimer() {
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
        if (!gameState.gameWon && gameState.gameStarted) {
            gameState.timeElapsed++;
        }
    }, 1000);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function setupEventListeners() {
    // Inicio / Continuar
    const startBtn = document.getElementById('btn-start');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            sfx.click();
            resetGameState();
            gameState.gameStarted = true;
            launchGame();
        });
    }

    const continueBtn = document.getElementById('btn-continue');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            sfx.click();
            loadGameState();
            gameState.gameStarted = true;
            launchGame();
        });
    }

    // Header y Menú
    const mapBtn = document.getElementById('btn-map');
    if (mapBtn) {
        mapBtn.addEventListener('click', () => {
            sfx.click();
            openModal('modal-map');
            updateMapUI();
        });
    }

    const dataBankBtn = document.getElementById('btn-databank');
    if (dataBankBtn) {
        dataBankBtn.addEventListener('click', () => {
            sfx.click();
            gameState.hintsUsed++;
            openModal('modal-help');
            renderHintsAndCodex();
            saveGameState();
        });
    }

    const soundBtn = document.getElementById('btn-sound');
    if (soundBtn) {
        soundBtn.addEventListener('click', (e) => {
            const isSoundOn = sfx.toggle();
            e.currentTarget.textContent = isSoundOn ? '🔊' : '🔇';
            e.currentTarget.dataset.soundOn = isSoundOn ? 'true' : 'false';
            sfx.click();
        });
    }

    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            sfx.click();
            saveGameState();
            showDialogue('💾 Partida guardada.');
        });
    }

    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('¿Reiniciar la partida? Se perderán todos los datos actuales.')) {
                resetGameState();
                location.reload();
            }
        });
    }

    // Navegación libre por flechas (todas las salas 1-8 desbloqueadas)
    document.querySelectorAll('.nav-arrow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = parseInt(e.currentTarget.dataset.targetRoom, 10);
            if (target >= 1 && target <= 8) {
                sfx.click();
                changeRoom(target);
            }
        });
    });

    // Nodos del mapa interactivo
    document.querySelectorAll('.map-node').forEach(node => {
        node.addEventListener('click', (e) => {
            const target = parseInt(e.currentTarget.dataset.gotoRoom, 10);
            if (target >= 1 && target <= 8) {
                sfx.click();
                closeAllModals();
                changeRoom(target);
            }
        });
    });

    // Hotspots interactivos
    document.querySelectorAll('.hotspot').forEach(hs => {
        hs.addEventListener('click', (e) => {
            sfx.click();
            handleHotspot(e.currentTarget.dataset.action);
        });
    });

    // Botones de cierre de modales
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            sfx.click();
            closeAllModals();
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && !overlay.classList.contains('victory-overlay')) {
                sfx.click();
                closeAllModals();
            }
        });
    });

    // Inventario y Combinación
    const combineBtn = document.getElementById('btn-combine');
    if (combineBtn) {
        combineBtn.addEventListener('click', handleItemCombination);
    }

    const collectItemBtn = document.getElementById('btn-collect-item');
    if (collectItemBtn) {
        collectItemBtn.addEventListener('click', collectPendingItem);
    }

    // Receptáculos de la Bóveda (Sector 8)
    document.querySelectorAll('.vault-slot').forEach(slot => {
        slot.addEventListener('click', (e) => {
            const slotIndex = parseInt(e.currentTarget.dataset.vslot, 10) - 1;
            handleVaultSlotPlacement(slotIndex);
        });
    });

    const restartBtn = document.getElementById('btn-restart-game');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            resetGameState();
            location.reload();
        });
    }

    // Listeners de puzles
    setupWordlockListeners();
    setupCircuitListeners();
    setupSafeKeypadListeners();
    setupSynthListeners();
    setupPipesListeners();
    setupCodebreakerListeners();
    setupLightsGridListeners();
    setupMasterCodeListeners();
}

function launchGame() {
    const startScreen = document.getElementById('start-screen');
    const gameScreen = document.getElementById('game-screen');
    if (startScreen) startScreen.classList.remove('active');
    if (gameScreen) gameScreen.classList.add('active');

    changeRoom(gameState.currentRoom);
    updateInventoryUI();
    updateVaultSlotsUI();
    updateProgressBar();
    updateMapUI();
    startTimer();
}

function changeRoom(roomNumber) {
    gameState.currentRoom = roomNumber;

    document.querySelectorAll('.room-view').forEach(view => view.classList.remove('active'));
    const targetRoom = document.getElementById(`room-${roomNumber}`);
    if (targetRoom) targetRoom.classList.add('active');

    const codeTag = document.getElementById('room-code-tag');
    if (codeTag) codeTag.textContent = `SEC-0${roomNumber}`;

    const titleTag = document.getElementById('current-room-title');
    if (titleTag) titleTag.textContent = ROOM_NAMES[roomNumber] || `Sector ${roomNumber}`;

    updateProgressBar();
    updateMapUI();
    saveGameState();
}

function updateProgressBar() {
    document.querySelectorAll('.progress-seg').forEach(seg => {
        const segNum = parseInt(seg.dataset.seg, 10);
        seg.className = 'progress-seg';

        const isCleared = isRoomCleared(segNum);
        if (isCleared) {
            seg.classList.add('cleared');
        } else if (segNum === gameState.currentRoom) {
            seg.classList.add('active');
        } else {
            seg.classList.add('unlocked');
        }
    });
}

function isRoomCleared(roomNum) {
    switch (roomNum) {
        case 1: return gameState.solvedPuzzles.wordlock;
        case 2: return gameState.solvedPuzzles.circuit;
        case 3: return gameState.solvedPuzzles.safe;
        case 4: return gameState.solvedPuzzles.synth;
        case 5: return gameState.solvedPuzzles.pipes;
        case 6: return gameState.solvedPuzzles.codebreaker;
        case 7: return gameState.solvedPuzzles.lights;
        case 8: return gameState.solvedPuzzles.masterDoor;
        default: return false;
    }
}

function updateMapUI() {
    document.querySelectorAll('.map-node').forEach(node => {
        const roomNum = parseInt(node.dataset.gotoRoom, 10);
        node.classList.add('active');
        const cleared = isRoomCleared(roomNum);
        if (cleared) {
            node.style.borderColor = 'var(--neon-green)';
            node.style.boxShadow = '0 0 8px var(--neon-green-dim)';
        } else {
            node.style.borderColor = '';
            node.style.boxShadow = '';
        }
    });
}

// ==========================================
// 3. SISTEMA TOAST SINGLETON (ESTRICTO ANTISPAM)
// ==========================================
let activeToastTimeout = null;
let currentToastMsg = '';

function showDialogue(text) {
    const el = document.getElementById('dialogue-text');
    if (el) el.textContent = text;
    showToastNotification(text);
}

function showToastNotification(text) {
    let container = document.getElementById('vault-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'vault-toast-container';
        container.style.cssText = `
            position: fixed;
            top: 14px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 999999;
            width: 90%;
            max-width: 390px;
            pointer-events: none;
            display: flex;
            justify-content: center;
        `;
        document.body.appendChild(container);
    }

    if (currentToastMsg === text && container.children.length > 0) {
        return;
    }

    container.innerHTML = '';
    if (activeToastTimeout) {
        clearTimeout(activeToastTimeout);
        activeToastTimeout = null;
    }

    currentToastMsg = text;

    const isError = text.includes('❌') || text.includes('⚠️');
    const isSuccess = text.includes('🔓') || text.includes('⚡') || text.includes('✨') || text.includes('🎹') || text.includes('🌀') || text.includes('🛰️') || text.includes('❄️') || text.includes('🏆');

    let borderColor = 'var(--neon-cyan, #00f3ff)';
    let shadowColor = 'rgba(0, 243, 255, 0.4)';
    if (isError) {
        borderColor = 'var(--neon-red, #ff0055)';
        shadowColor = 'rgba(255, 0, 85, 0.45)';
    } else if (isSuccess) {
        borderColor = 'var(--neon-green, #00ff88)';
        shadowColor = 'rgba(0, 255, 136, 0.45)';
    }

    const toast = document.createElement('div');
    toast.className = 'vault-toast-single';
    toast.style.cssText = `
        background: rgba(6, 11, 18, 0.97);
        border: 1.5px solid ${borderColor};
        color: #ffffff;
        padding: 9px 15px;
        border-radius: 10px;
        font-family: var(--font-ui, 'Rajdhani', sans-serif);
        font-size: 13px;
        font-weight: 700;
        text-align: center;
        line-height: 1.3;
        box-shadow: 0 4px 20px ${shadowColor};
        backdrop-filter: blur(10px);
        transform: translateY(-10px);
        opacity: 0;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease;
        pointer-events: none;
        width: 100%;
    `;
    toast.textContent = text;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    });

    activeToastTimeout = setTimeout(() => {
        toast.style.transform = 'translateY(-10px)';
        toast.style.opacity = '0';
        setTimeout(() => {
            if (container.contains(toast)) toast.remove();
            if (currentToastMsg === text) currentToastMsg = '';
        }, 220);
    }, 2400);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
}

// ==========================================
// 4. MODAL DINÁMICO DE SELECCIÓN DE OBJETOS
// ==========================================
function ensureItemSelectionModalExists() {
    if (document.getElementById('modal-select-item')) return;

    const modal = document.createElement('div');
    modal.id = 'modal-select-item';
    modal.className = 'modal-overlay hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
        <div class="modal-card">
            <button class="modal-close-btn" id="btn-close-select-modal" aria-label="Cerrar">✖</button>
            <h3 id="select-modal-title">🔒 Mecanismo bloqueado</h3>
            <p id="select-modal-desc" class="modal-sub"></p>
            <div id="select-modal-list" style="display: flex; flex-direction: column; gap: 8px; margin: 16px 0; max-height: 250px; overflow-y: auto; padding-right: 4px;"></div>
            <button id="btn-cancel-select-modal" class="btn-cyber-sec" style="margin-top: 8px;">Cancelar</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-close-select-modal').onclick = () => {
        sfx.click();
        modal.classList.add('hidden');
    };
    document.getElementById('btn-cancel-select-modal').onclick = () => {
        sfx.click();
        modal.classList.add('hidden');
    };
}

function openItemSelectionModal(title, desc, targetKey) {
    ensureItemSelectionModalExists();
    currentItemSelectionTarget = targetKey;

    document.getElementById('select-modal-title').textContent = title;
    document.getElementById('select-modal-desc').textContent = desc;

    const listContainer = document.getElementById('select-modal-list');
    listContainer.innerHTML = '';

    if (gameState.inventory.length === 0) {
        listContainer.innerHTML = `
            <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; padding: 16px; color: var(--text-muted);">
                ⚠️ No llevas ningún objeto en tu inventario táctico. Explora las instalaciones para encontrar herramientas y componentes.
            </div>
        `;
    } else {
        gameState.inventory.forEach(itemId => {
            const item = ITEMS[itemId];
            if (!item) return;

            const btn = document.createElement('button');
            btn.className = 'select-item-choice-btn';
            btn.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                padding: 10px 12px;
                border-radius: 8px;
                border: 1px solid var(--border-glow, rgba(0, 243, 255, 0.3));
                background: rgba(0, 243, 255, 0.05);
                color: #ffffff;
                font-family: var(--font-ui, 'Rajdhani', sans-serif);
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                text-align: left;
                transition: background 0.15s, border-color 0.15s, transform 0.1s;
            `;

            btn.onmouseenter = () => {
                btn.style.background = 'rgba(0, 243, 255, 0.16)';
                btn.style.borderColor = 'var(--neon-cyan, #00f3ff)';
            };
            btn.onmouseleave = () => {
                btn.style.background = 'rgba(0, 243, 255, 0.05)';
                btn.style.borderColor = 'var(--border-glow, rgba(0, 243, 255, 0.3))';
            };

            btn.innerHTML = `
                <span style="font-size: 22px;">${item.icon}</span>
                <span style="flex: 1;">${item.name}</span>
            `;

            btn.onclick = () => {
                handleItemUsage(targetKey, itemId);
            };

            listContainer.appendChild(btn);
        });
    }

    openModal('modal-select-item');
}

function handleItemUsage(targetKey, chosenItemId) {
    const selectModal = document.getElementById('modal-select-item');

    // 1. CUADRO DE CIRCUITOS (SEC-02)
    if (targetKey === 'circuit') {
        if (chosenItemId === 'cable_reparado') {
            sfx.success();
            removeItemFromInventory('cable_reparado');
            gameState.unlockedDevices.circuit = true;
            saveGameState();
            selectModal.classList.add('hidden');
            showDialogue('⚡ ¡Has conectado el Cable Aislado! Los relés reciben corriente. Cuadro activado.');
            openModal('modal-circuit');
        } else {
            sfx.error();
            showDialogue('❌ Ese objeto no sirve para cerrar el circuito ni conducir corriente en los relés.');
        }
    }

    // 2. SINTETIZADOR MODULAR (SEC-04)
    else if (targetKey === 'synth') {
        if (chosenItemId === 'partitura_digital') {
            sfx.success();
            gameState.unlockedDevices.synth = true;
            saveGameState();
            selectModal.classList.add('hidden');
            showDialogue('📜 ¡Partitura Digital cargada en la memoria del sintetizador! Listo para afinarse.');
            openModal('modal-synth');
        } else {
            sfx.error();
            showDialogue('❌ Ese objeto no contiene datos acústicos ni frecuencias musicales.');
        }
    }

    // 3. CONSOLA DE TUBERÍAS (SEC-05)
    else if (targetKey === 'pipes') {
        if (chosenItemId === 'llave_valvula') {
            sfx.success();
            removeItemFromInventory('llave_valvula');
            gameState.unlockedDevices.pipes = true;
            saveGameState();
            selectModal.classList.add('hidden');
            showDialogue('🌀 ¡Has girado la Llave de Válvula! El cerrojo hidráulico se libera.');
            openModal('modal-pipes');
        } else {
            sfx.error();
            showDialogue('❌ Ese objeto no encaja en la rosca de la válvula maestra.');
        }
    }

    // 4. CONSOLA DE VIGILANCIA (SEC-06)
    else if (targetKey === 'codebreaker') {
        if (chosenItemId === 'chip_vigilancia') {
            sfx.success();
            removeItemFromInventory('chip_vigilancia');
            gameState.unlockedDevices.codebreaker = true;
            saveGameState();
            selectModal.classList.add('hidden');
            showDialogue('💾 ¡Chip Desencriptador insertado! Terminal desbloqueada para descifrar.');
            openModal('modal-codebreaker');
        } else {
            sfx.error();
            showDialogue('❌ Ese objeto no es compatible con el puerto de datos de la consola.');
        }
    }

    // 5. MATRIZ DE SOPORTE VITAL (SEC-07)
    else if (targetKey === 'lights') {
        if (chosenItemId === 'refrigerante_criogenico') {
            sfx.success();
            removeItemFromInventory('refrigerante_criogenico');
            gameState.unlockedDevices.lights = true;
            saveGameState();
            selectModal.classList.add('hidden');
            showDialogue('❄️ ¡Cápsula de Refrigerante inyectada! Los reguladores bajan a 0°C.');
            openModal('modal-lightsgrid');
        } else {
            sfx.error();
            showDialogue('❌ Ese objeto no tiene propiedades térmicas para enfriar los generadores.');
        }
    }

    // 6. ALTARES DE LA BÓVEDA (SEC-08)
    else if (targetKey.startsWith('altar_')) {
        const slotIdx = parseInt(targetKey.split('_')[1], 10);
        const expectedCore = `core_${slotIdx + 1}`;

        if (chosenItemId === expectedCore) {
            sfx.success();
            removeItemFromInventory(chosenItemId);
            gameState.placedCores[slotIdx] = true;
            updateVaultSlotsUI();
            saveGameState();
            selectModal.classList.add('hidden');

            const total = gameState.placedCores.filter(Boolean).length;
            showDialogue(`⚡ ¡Has encajado el ${ITEMS[chosenItemId].name} en el Altar ${slotIdx + 1}! (${total}/7 instalados).`);

            if (total === 7) {
                setTimeout(() => {
                    showDialogue('🌟 ¡Los 7 núcleos de energía están en sus puestos! La compuerta blindada principal está lista para ser descifrada.');
                }, 1200);
            }
        } else if (chosenItemId.startsWith('core_')) {
            sfx.error();
            showDialogue(`❌ Este núcleo resuena en otra frecuencia. No corresponde al Altar ${slotIdx + 1}.`);
        } else {
            sfx.error();
            showDialogue('❌ Ese objeto no es un núcleo de energía.');
        }
    }
}

// ==========================================
// 5. AMBIENTACIÓN PURA (SIN SPOILERS EN TEXTO)
// ==========================================
function handleHotspot(action) {
    switch (action) {
        // --- SECTOR 1: TALLER DE CONTROL ---
        case 'inspect-corkboard':
            showDialogue('📌 Pizarra de Turno: Una nota de guardia garabateada muestra cuatro marcas de color: 🔴 - 🟡 - 🔵 - 🟣.');
            break;

        case 'inspect-workbench':
            if (!gameState.collectedHotspots.includes('cable_rojo') && !hasItem('cable_rojo')) {
                openInspectModal('Cable de Cobre', '🧵', ITEMS['cable_rojo'].desc, 'cable_rojo');
            } else {
                showDialogue('🛠️ Mesa de trabajo. No quedan más piezas útiles aquí.');
            }
            break;

        case 'inspect-floor-panel':
            showDialogue('⚙️ Tapa metálica suelta en el suelo. Da acceso a la canaleta de cableado.');
            break;

        case 'inspect-terminal':
            showDialogue('🖥️ Terminal de Diagnóstico: Muestra un registro de osciloscopio: [DO - MI - SOL - LA - SI].');
            break;

        case 'open-chest-modal':
            if (gameState.solvedPuzzles.wordlock) {
                showDialogue('🧰 El cofre de acero ya está abierto y vacío.');
            } else {
                openModal('modal-wordlock');
            }
            break;

        // --- SECTOR 2: LABORATORIO ELÉCTRICO ---
        case 'inspect-diagnostics-panel':
            showDialogue('📟 Panel de Diagnóstico: Esquema hidráulico: "Caudal activo por el perímetro exterior. Módulo central bloqueado".');
            break;

        case 'inspect-server':
            showDialogue('🎛️ Rack de Servidores: Una etiqueta adhesiva desgastada tiene grabado el número: "8492".');
            break;

        case 'open-circuit-modal':
            if (gameState.solvedPuzzles.circuit) {
                showDialogue('⚡ El puente de relés ya está energizado.');
            } else if (gameState.unlockedDevices.circuit) {
                openModal('modal-circuit');
            } else {
                openItemSelectionModal(
                    '⚡ Cuadro de Circuitos',
                    'Los relés están abiertos y sin puente conductor. Selecciona un objeto de tu inventario para puentearlos:',
                    'circuit'
                );
            }
            break;

        // --- SECTOR 3: ARCHIVO DE CIFRADOS ---
        case 'inspect-facility-map':
            showDialogue('🗺️ Mapa de la Instalación: Diagrama estructural con 7 receptáculos de energía y una compuerta principal.');
            break;

        case 'inspect-archives':
            if (!gameState.collectedHotspots.includes('conector') && !hasItem('conector')) {
                openInspectModal('Conector Rápido', '🔌', ITEMS['conector'].desc, 'conector');
            } else {
                showDialogue('📚 Estantes de planos y componentes electrónicos ya revisados.');
            }
            break;

        case 'open-safe-modal':
            if (gameState.solvedPuzzles.safe) {
                showDialogue('🔐 La Caja Fuerte V3 ya está abierta.');
            } else {
                currentSafeInput = '';
                updateSafeKeypadDisplay();
                openModal('modal-safe');
            }
            break;

        // --- SECTOR 4: ESTUDIO ACÚSTICO ---
        case 'inspect-mixing-desk':
            showDialogue('🎚️ Mesa de Mezclas: Nota técnica adjunta: "Sobrecarga lumínica requerida: 16/16 celdas activas".');
            break;

        case 'inspect-speakers':
            showDialogue('🔊 Monitores de audio listos para emitir señal acústica.');
            break;

        case 'open-synth-modal':
            if (gameState.solvedPuzzles.synth) {
                showDialogue('🎹 El sintetizador modular ya está calibrado.');
            } else if (gameState.unlockedDevices.synth) {
                currentSynthInput = [];
                updateSynthDisplay();
                openModal('modal-synth');
            } else {
                openItemSelectionModal(
                    '🎹 Sintetizador Modular',
                    'La memoria de frecuencias tonales está vacía. Selecciona un objeto para cargar las notas:',
                    'synth'
                );
            }
            break;

        // --- SECTOR 5: PLANTA DE FLUIDOS ---
        case 'inspect-pressure-gauges':
            showDialogue('🌡️ Manómetros de Presión: Registran fluctuaciones en el caudal secundario.');
            break;

        case 'inspect-drain-grate':
            if (!gameState.collectedHotspots.includes('refrigerante_criogenico') && !hasItem('refrigerante_criogenico')) {
                openInspectModal('Cápsula de Refrigerante', '🧪', ITEMS['refrigerante_criogenico'].desc, 'refrigerante_criogenico');
            } else {
                showDialogue('🌀 Rejilla de drenaje con marcas de condensación helada.');
            }
            break;

        case 'open-pipes-modal':
            if (gameState.solvedPuzzles.pipes) {
                showDialogue('🔧 El circuito de fluidos ya está en funcionamiento.');
            } else if (gameState.unlockedDevices.pipes) {
                openModal('modal-pipes');
            } else {
                openItemSelectionModal(
                    '🔧 Consola de Tuberías',
                    'La válvula principal está trabada por un cerrojo de seguridad. Selecciona un objeto para desbloquearla:',
                    'pipes'
                );
            }
            break;

        // --- SECTOR 6: CENTRO DE VIGILANCIA ---
        case 'inspect-security-monitors':
            showDialogue('🛰️ Monitores de Seguridad: Registro de telemetría: [Alpha: ON | Beta: OFF | Gamma: ON | Delta: ON].');
            break;

        case 'inspect-camera-log':
            if (!gameState.collectedHotspots.includes('fusible_alta_tension') && !hasItem('fusible_alta_tension')) {
                openInspectModal('Fusible Crítico', '🔋', ITEMS['fusible_alta_tension'].desc, 'fusible_alta_tension');
            } else {
                showDialogue('📹 Registro de cámaras secundario.');
            }
            break;

        case 'open-codebreaker-modal':
            if (gameState.solvedPuzzles.codebreaker) {
                showDialogue('🛰️ La consola de vigilancia ya ha sido desbloqueada.');
            } else if (gameState.unlockedDevices.codebreaker) {
                openModal('modal-codebreaker');
            } else {
                openItemSelectionModal(
                    '🛰️ Consola de Vigilancia',
                    'Terminal bloqueada por protocolo de cifrado. Selecciona un objeto para desencriptar el acceso:',
                    'codebreaker'
                );
            }
            break;

        // --- SECTOR 7: CÁMARA CRIOGÉNICA ---
        case 'inspect-cryo-pod':
            showDialogue('🧊 Cápsula Criogénica sellada herméticamente bajo cero.');
            break;

        case 'inspect-emergency-locker':
            showDialogue('🚨 Taquilla de Emergencia: En la chapa metálica hay grabada una palabra: "S A W S".');
            break;

        case 'open-lightsgrid-modal':
            if (gameState.solvedPuzzles.lights) {
                showDialogue('❄️ La matriz de soporte vital está completamente encendida.');
            } else if (gameState.unlockedDevices.lights) {
                openModal('modal-lightsgrid');
            } else {
                openItemSelectionModal(
                    '🚨 Matriz de Emergencia',
                    'Alerta térmica: Los generadores de soporte vital están sobrecalentados. Selecciona un objeto para enfriarlos:',
                    'lights'
                );
            }
            break;

        // --- SECTOR 8: LA BÓVEDA PRINCIPAL ---
        case 'inspect-master-door':
            const placedCount = gameState.placedCores.filter(Boolean).length;
            if (placedCount < 7) {
                sfx.error();
                showDialogue(`🔒 Compuerta blindada bloqueada. Faltan núcleos en el altar (${placedCount}/7 instalados).`);
            } else {
                openModal('modal-mastercode');
            }
            break;

        default:
            showDialogue('No hay nada relevante que inspeccionar.');
    }
}

// ==========================================
// 6. INVENTARIO INFINITO, DESLIZABLE E INTELIGENTE
// ==========================================
function isItemCombinable(itemId) {
    return RECIPES.some(r => r.ingredients.includes(itemId));
}

function addItemToInventory(itemId) {
    if (!gameState.inventory.includes(itemId)) {
        gameState.inventory.push(itemId);
        if (!gameState.collectedHotspots.includes(itemId)) {
            gameState.collectedHotspots.push(itemId);
        }
        sfx.itemPickup();
        updateInventoryUI();
        saveGameState();
        return true;
    }
    return false;
}

function hasItem(itemId) {
    return gameState.inventory.includes(itemId);
}

function removeItemFromInventory(itemId) {
    gameState.inventory = gameState.inventory.filter(id => id !== itemId);
    gameState.selectedForCombine = gameState.selectedForCombine.filter(id => id !== itemId);
    updateInventoryUI();
    saveGameState();
}

function updateInventoryUI() {
    const container = document.getElementById('inventory-slots');
    const topLabel = document.querySelector('.inventory-top span');
    
    if (topLabel) {
        topLabel.innerHTML = `Inventario táctico (<span id="inv-count">${gameState.inventory.length}</span>)`;
    }

    if (!container) return;

    // Desplazamiento horizontal fluido
    container.style.display = 'flex';
    container.style.flexWrap = 'nowrap';
    container.style.overflowX = 'auto';
    container.style.overflowY = 'hidden';
    container.style.gap = '8px';
    container.style.padding = '4px 2px 6px';
    container.style.scrollbarWidth = 'thin';
    container.style.webkitOverflowScrolling = 'touch';

    container.innerHTML = '';

    // Renderizar ítems que posee el jugador
    gameState.inventory.forEach(itemId => {
        const item = ITEMS[itemId];
        if (!item) return;

        const slot = document.createElement('div');
        slot.className = 'slot-item filled';
        slot.style.flex = '0 0 46px';
        slot.style.width = '46px';
        slot.style.height = '46px';
        slot.style.minWidth = '46px';
        slot.style.minHeight = '46px';

        if (gameState.selectedForCombine.includes(itemId)) {
            slot.classList.add('selected');
        }
        slot.textContent = item.icon;
        slot.title = item.name;

        // Si es combinable (cable, conector) se selecciona; si es pergamino/documento/núcleo se abre para leer
        slot.onclick = () => {
            if (isItemCombinable(itemId)) {
                toggleSelectForCombine(itemId);
            } else {
                sfx.click();
                openInspectModal(item.name, item.icon, item.desc);
            }
        };

        container.appendChild(slot);
    });

    // Huecos vacíos mínimos para balance visual
    const minVisibleSlots = 8;
    const emptySlotsNeeded = Math.max(0, minVisibleSlots - gameState.inventory.length);
    for (let i = 0; i < emptySlotsNeeded; i++) {
        const emptySlot = document.createElement('div');
        emptySlot.className = 'slot-item empty';
        emptySlot.style.flex = '0 0 46px';
        emptySlot.style.width = '46px';
        emptySlot.style.height = '46px';
        emptySlot.style.minWidth = '46px';
        emptySlot.style.minHeight = '46px';
        container.appendChild(emptySlot);
    }

    const combineBtn = document.getElementById('btn-combine');
    if (combineBtn) {
        combineBtn.textContent = `⚡ Combinar (${gameState.selectedForCombine.length})`;
    }
}

function toggleSelectForCombine(itemId) {
    sfx.click();
    if (gameState.selectedForCombine.includes(itemId)) {
        gameState.selectedForCombine = gameState.selectedForCombine.filter(i => i !== itemId);
    } else {
        if (gameState.selectedForCombine.length < 2) {
            gameState.selectedForCombine.push(itemId);
        } else {
            gameState.selectedForCombine = [gameState.selectedForCombine[1], itemId];
        }
    }
    updateInventoryUI();
}

function handleItemCombination() {
    if (gameState.selectedForCombine.length !== 2) {
        sfx.error();
        showDialogue('Selecciona exactamente 2 objetos combinables en tu inventario.');
        return;
    }

    const [itemA, itemB] = gameState.selectedForCombine;
    const recipe = RECIPES.find(r => 
        (r.ingredients.includes(itemA) && r.ingredients.includes(itemB))
    );

    if (recipe) {
        sfx.success();
        removeItemFromInventory(itemA);
        removeItemFromInventory(itemB);
        addItemToInventory(recipe.result);
        gameState.selectedForCombine = [];
        showDialogue(`✨ Has fabricado: ${ITEMS[recipe.result].name}.`);
        openInspectModal(ITEMS[recipe.result].name, ITEMS[recipe.result].icon, ITEMS[recipe.result].desc);
    } else {
        sfx.error();
        showDialogue('❌ Esos objetos no se pueden combinar.');
        gameState.selectedForCombine = [];
        updateInventoryUI();
    }
}

function openInspectModal(title, icon, desc, itemId = null, fragment = null) {
    const tEl = document.getElementById('inspect-title');
    const iEl = document.getElementById('inspect-icon');
    const dEl = document.getElementById('inspect-text');
    if (tEl) tEl.textContent = title;
    if (iEl) iEl.textContent = icon;
    if (dEl) dEl.textContent = desc;

    const fragBadge = document.getElementById('inspect-fragment-badge');
    if (fragBadge) {
        if (fragment) {
            fragBadge.classList.remove('hidden');
            fragBadge.textContent = `🧩 Fragmento del código maestro: "${fragment}"`;
        } else {
            fragBadge.classList.add('hidden');
        }
    }

    const collectBtn = document.getElementById('btn-collect-item');
    if (collectBtn) {
        if (itemId && !hasItem(itemId)) {
            pendingInspectItem = itemId;
            collectBtn.classList.remove('hidden');
        } else {
            pendingInspectItem = null;
            collectBtn.classList.add('hidden');
        }
    }

    openModal('modal-inspect');
}

function collectPendingItem() {
    if (pendingInspectItem) {
        const added = addItemToInventory(pendingInspectItem);
        if (added) {
            showDialogue(`📦 Has guardado "${ITEMS[pendingInspectItem].name}" en tu inventario.`);
            pendingInspectItem = null;
            closeAllModals();
        }
    }
}

function unlockFragment(index, char) {
    gameState.codexFragments[index] = char;
    saveGameState();
    renderHintsAndCodex();
}

// ==========================================
// 7. BITÁCORA Y PISTAS (SÓLO AQUÍ ARRIBA)
// ==========================================
function renderHintsAndCodex() {
    const list = document.getElementById('hints-list');
    let hints = [];

    if (!gameState.solvedPuzzles.wordlock) {
        hints.push('🔍 SEC-01 (Taller): La clave de 4 letras del cofre está anotada en la taquilla de emergencia de Criogenia (SEC-07).');
    }
    if (!gameState.solvedPuzzles.circuit) {
        hints.push('🔍 SEC-02 (Laboratorio): Cuadro eléctrico sin puente. Combina el Cable (SEC-01) y el Conector (SEC-03) y úsalo para energizarlo. El orden de los relés está en Vigilancia (SEC-06).');
    }
    if (!gameState.solvedPuzzles.safe) {
        hints.push('🔍 SEC-03 (Archivo): El código numérico de 4 dígitos de la caja fuerte está en una etiqueta del servidor en el Laboratorio (SEC-02).');
    }
    if (!gameState.solvedPuzzles.synth) {
        hints.push('🔍 SEC-04 (Estudio): Carga la Partitura Digital (SEC-03) en el sintetizador y reproduce las notas indicadas en la terminal de SEC-01.');
    }
    if (!gameState.solvedPuzzles.pipes) {
        hints.push('🔍 SEC-05 (Fluidos): Usa la Llave de Válvula (SEC-04) para desbloquear la consola y gira las tuberías perimetrales según el plano de SEC-02.');
    }
    if (!gameState.solvedPuzzles.codebreaker) {
        hints.push('🔍 SEC-06 (Vigilancia): Usa el Chip Desencriptador (SEC-05) para acceder a la terminal e introduce los colores de la pizarra de SEC-01.');
    }
    if (!gameState.solvedPuzzles.lights) {
        hints.push('🔍 SEC-07 (Criogenia): Usa el Refrigerante (SEC-05) para enfriar los generadores de la matriz y enciende las 16 luces.');
    }
    
    const placedCoresCount = gameState.placedCores.filter(Boolean).length;
    if (placedCoresCount < 7) {
        hints.push(`🔍 SEC-08 (Bóveda): Selecciona y coloca cada uno de los 7 núcleos en su altar correspondiente (${placedCoresCount}/7 instalados).`);
    } else if (!gameState.solvedPuzzles.masterDoor) {
        hints.push('🔍 SEC-08 (Bóveda): Todos los núcleos instalados. Introduce el código de 7 dígitos reunido de cada sector.');
    }

    if (list) {
        list.innerHTML = hints.length 
            ? hints.map(h => `<p>${h}</p>`).join('') 
            : '<p>¡Todos los sectores completados! Ve a la Bóveda del Sector 8 y abre la compuerta final.</p>';
    }

    gameState.codexFragments.forEach((frag, idx) => {
        const el = document.getElementById(`codex-frag-${idx + 1}`);
        if (el) {
            el.textContent = frag;
            if (frag !== '?') {
                el.classList.add('unlocked');
            } else {
                el.classList.remove('unlocked');
            }
        }
    });
}

// ==========================================
// 8. LÓGICA DE PUZLES
// ==========================================

// --- PUZLE 1: WORDLOCK (SEC-01) ---
function setupWordlockListeners() {
    document.querySelectorAll('#modal-wordlock .wheel-arrow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const wheel = parseInt(e.currentTarget.dataset.wheel, 10);
            const dir = e.currentTarget.dataset.dir;
            sfx.gear();
            if (dir === 'up') {
                currentWheelIndices[wheel] = (currentWheelIndices[wheel] + 1) % ALPHABET.length;
            } else {
                currentWheelIndices[wheel] = (currentWheelIndices[wheel] - 1 + ALPHABET.length) % ALPHABET.length;
            }
            const wheelVal = document.getElementById(`wheel-${wheel}`);
            if (wheelVal) wheelVal.textContent = ALPHABET[currentWheelIndices[wheel]];
        });
    });

    const checkBtn = document.getElementById('btn-check-wordlock');
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            const word = currentWheelIndices.map(i => ALPHABET[i]).join('');
            if (word === PUZZLE_SOLUTIONS.wordlock) {
                sfx.success();
                gameState.solvedPuzzles.wordlock = true;
                unlockFragment(0, '7');
                closeAllModals();
                addItemToInventory('core_1');
                updateProgressBar();
                updateMapUI();
                showDialogue('🔓 Cofre de acero desbloqueado. Obtienes el Núcleo Alfa.');
                openInspectModal('Núcleo Alfa', '🔮', ITEMS['core_1'].desc, null, '7');
            } else {
                sfx.error();
                showDialogue('❌ Combinación incorrecta.');
            }
        });
    }
}

// --- PUZLE 2: PUENTE DE CIRCUITOS (SEC-02) ---
function setupCircuitListeners() {
    document.querySelectorAll('#modal-circuit .switch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.sw, 10);
            circuitSwitches[idx] = !circuitSwitches[idx];
            sfx.click();
            e.currentTarget.classList.toggle('on', circuitSwitches[idx]);
            e.currentTarget.textContent = circuitSwitches[idx] ? 'ON' : 'OFF';
            
            const str = circuitSwitches.map(s => s ? 'ON' : 'OFF').join('-');
            const patternEl = document.getElementById('circuit-pattern');
            if (patternEl) patternEl.textContent = `PATRÓN: ${str}`;
        });
    });

    const checkBtn = document.getElementById('btn-check-circuit');
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            const isMatch = circuitSwitches.every((val, i) => val === PUZZLE_SOLUTIONS.circuitSwitches[i]);
            if (isMatch) {
                sfx.success();
                gameState.solvedPuzzles.circuit = true;
                unlockFragment(1, '4');
                closeAllModals();
                addItemToInventory('core_2');
                updateProgressBar();
                updateMapUI();
                showDialogue('⚡ Puente de relés activado. Obtienes el Núcleo Beta.');
                openInspectModal('Núcleo Beta', '💎', ITEMS['core_2'].desc, null, '4');
            } else {
                sfx.error();
                showDialogue('❌ Configuración de relés incorrecta.');
            }
        });
    }
}

// --- PUZLE 3: CAJA FUERTE CIFRADA (SEC-03) ---
function setupSafeKeypadListeners() {
    document.querySelectorAll('#modal-safe .key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.currentTarget.dataset.key;
            sfx.beep(750);
            if (key === 'C') {
                currentSafeInput = '';
            } else if (key === 'OK') {
                if (currentSafeInput === PUZZLE_SOLUTIONS.safeCode) {
                    sfx.success();
                    gameState.solvedPuzzles.safe = true;
                    unlockFragment(2, '9');
                    closeAllModals();
                    addItemToInventory('core_3');
                    addItemToInventory('partitura_digital');
                    updateProgressBar();
                    updateMapUI();
                    showDialogue('🔓 Caja Fuerte abierta. Obtienes el Núcleo Gamma y la Partitura Digital.');
                    openInspectModal('Núcleo Gamma', '🧩', ITEMS['core_3'].desc, null, '9');
                } else {
                    sfx.error();
                    showDialogue('❌ Código numérico erróneo.');
                    currentSafeInput = '';
                }
            } else {
                if (currentSafeInput.length < 4) {
                    currentSafeInput += key;
                }
            }
            updateSafeKeypadDisplay();
        });
    });
}

function updateSafeKeypadDisplay() {
    const disp = document.getElementById('safe-display');
    if (disp) disp.textContent = currentSafeInput.padEnd(4, '_');
}

// --- PUZLE 4: SINTETIZADOR MODULAR (SEC-04) ---
const NOTE_FREQUENCIES = {
    'DO': 261.63, 'RE': 293.66, 'MI': 329.63,
    'FA': 349.23, 'SOL': 392.00, 'LA': 440.00, 'SI': 493.88
};

function setupSynthListeners() {
    document.querySelectorAll('.synth-key').forEach(key => {
        key.addEventListener('click', (e) => {
            const note = e.currentTarget.dataset.note;
            if (NOTE_FREQUENCIES[note]) {
                sfx.playTone(NOTE_FREQUENCIES[note], 'sine', 0.3, 0.2);
            }
            if (currentSynthInput.length < 5) {
                currentSynthInput.push(note);
                updateSynthDisplay();
            }
            if (currentSynthInput.length === 5) {
                setTimeout(checkSynthSolution, 350);
            }
        });
    });

    const playSeqBtn = document.getElementById('btn-play-sequence');
    if (playSeqBtn) {
        playSeqBtn.addEventListener('click', () => {
            playSynthTargetSequence();
        });
    }

    const resetSynthBtn = document.getElementById('btn-reset-synth');
    if (resetSynthBtn) {
        resetSynthBtn.addEventListener('click', () => {
            sfx.click();
            currentSynthInput = [];
            updateSynthDisplay();
        });
    }
}

function playSynthTargetSequence() {
    PUZZLE_SOLUTIONS.synthSequence.forEach((note, idx) => {
        setTimeout(() => {
            if (NOTE_FREQUENCIES[note]) {
                sfx.playTone(NOTE_FREQUENCIES[note], 'sine', 0.28, 0.22);
            }
            const btn = document.querySelector(`.synth-key[data-note="${note}"]`);
            if (btn) {
                btn.classList.add('playing');
                setTimeout(() => btn.classList.remove('playing'), 220);
            }
        }, idx * 400);
    });
}

function updateSynthDisplay() {
    const currentEl = document.getElementById('synth-current');
    if (currentEl) {
        currentEl.textContent = currentSynthInput.length ? currentSynthInput.join(' - ') : '----';
    }
}

function checkSynthSolution() {
    const isOk = currentSynthInput.every((n, i) => n === PUZZLE_SOLUTIONS.synthSequence[i]);
    if (isOk) {
        sfx.success();
        gameState.solvedPuzzles.synth = true;
        unlockFragment(3, '2');
        closeAllModals();
        addItemToInventory('core_4');
        addItemToInventory('llave_valvula');
        updateProgressBar();
        updateMapUI();
        showDialogue('🎹 Sintetizador calibrado. Obtienes el Núcleo Delta y una Llave de Válvula.');
        openInspectModal('Núcleo Delta', '🎹', ITEMS['core_4'].desc, null, '2');
    } else {
        sfx.error();
        showDialogue('❌ Secuencia tonal disonante.');
        currentSynthInput = [];
        updateSynthDisplay();
    }
}

// --- PUZLE 5: EMPALME DE TUBERÍAS (SEC-05) ---
function setupPipesListeners() {
    document.querySelectorAll('#pipes-grid .pipe-tile:not(.pipe-fixed)').forEach(tile => {
        tile.addEventListener('click', (e) => {
            const tileIdx = parseInt(e.currentTarget.dataset.tile, 10);
            sfx.gear();
            pipeRotations[tileIdx] = (pipeRotations[tileIdx] + 1) % 4;
            const deg = pipeRotations[tileIdx] * 90;
            e.currentTarget.style.transform = `rotate(${deg}deg)`;
            e.currentTarget.dataset.rotation = pipeRotations[tileIdx];
        });
    });

    const checkBtn = document.getElementById('btn-check-pipes');
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            const r1 = pipeRotations[1];
            const r2 = pipeRotations[2];
            const r5 = pipeRotations[5];
            const isComplete = ([0, 2].includes(r1) && r2 === 2 && [1, 3].includes(r5));

            const statusEl = document.getElementById('flow-status');
            if (isComplete) {
                sfx.success();
                gameState.solvedPuzzles.pipes = true;
                unlockFragment(4, '6');
                if (statusEl) statusEl.textContent = 'ESTADO: FLUJO CONECTADO (100%)';
                closeAllModals();
                addItemToInventory('core_5');
                addItemToInventory('chip_vigilancia');
                updateProgressBar();
                updateMapUI();
                showDialogue('🌀 Presión estabilizada. Obtienes el Núcleo Épsilon y un Chip Desencriptador.');
                openInspectModal('Núcleo Épsilon', '🌀', ITEMS['core_5'].desc, null, '6');
            } else {
                sfx.error();
                if (statusEl) statusEl.textContent = 'ESTADO: FUGA DETECTADA';
                showDialogue('❌ El circuito hidráulico presenta fugas u obstrucciones.');
            }
        });
    }
}

// --- PUZLE 6: DESCIFRADOR DE VIGILANCIA (SEC-06) ---
function setupCodebreakerListeners() {
    document.querySelectorAll('#guess-row .peg-slot').forEach(peg => {
        peg.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.peg, 10);
            sfx.click();
            const currSymbol = currentMastermindGuess[idx];
            const nextIdx = (MASTERMIND_SYMBOLS.indexOf(currSymbol) + 1) % MASTERMIND_SYMBOLS.length;
            currentMastermindGuess[idx] = MASTERMIND_SYMBOLS[nextIdx];
            e.currentTarget.textContent = currentMastermindGuess[idx];
        });
    });

    const submitBtn = document.getElementById('btn-submit-guess');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            mastermindAttempts++;
            sfx.click();
            const target = PUZZLE_SOLUTIONS.codebreakerSequence;
            const guess = currentMastermindGuess;

            let exact = 0;
            let colorMatch = 0;
            const targetUsed = [false, false, false, false];
            const guessUsed = [false, false, false, false];

            for (let i = 0; i < 4; i++) {
                if (guess[i] === target[i]) {
                    exact++;
                    targetUsed[i] = true;
                    guessUsed[i] = true;
                }
            }

            for (let i = 0; i < 4; i++) {
                if (!guessUsed[i]) {
                    for (let j = 0; j < 4; j++) {
                        if (!targetUsed[j] && guess[i] === target[j]) {
                            colorMatch++;
                            targetUsed[j] = true;
                            break;
                        }
                    }
                }
            }

            const historyContainer = document.getElementById('guess-history');
            if (historyContainer) {
                const row = document.createElement('div');
                row.className = 'history-item';
                row.innerHTML = `<span>${guess.join(' ')}</span> <span>${'✅'.repeat(exact)}${'🟨'.repeat(colorMatch)}</span>`;
                historyContainer.prepend(row);
            }

            const attemptsEl = document.getElementById('guess-attempts');
            if (attemptsEl) attemptsEl.textContent = `Intentos: ${mastermindAttempts} / 8`;

            if (exact === 4) {
                sfx.success();
                gameState.solvedPuzzles.codebreaker = true;
                unlockFragment(5, '1');
                closeAllModals();
                addItemToInventory('core_6');
                updateProgressBar();
                updateMapUI();
                showDialogue('🛰️ Acceso autorizado. Obtienes el Núcleo Zeta.');
                openInspectModal('Núcleo Zeta', '🛰️', ITEMS['core_6'].desc, null, '1');
            } else if (mastermindAttempts >= 8) {
                sfx.error();
                showDialogue('⚠️ Límite de intentos alcanzado. La consola se reinicia.');
                mastermindAttempts = 0;
                if (historyContainer) historyContainer.innerHTML = '';
                if (attemptsEl) attemptsEl.textContent = `Intentos: 0 / 8`;
            } else {
                sfx.beep(400);
            }
        });
    }
}

// --- PUZLE 7: MATRIZ DE SOPORTE VITAL (SEC-07) ---
function initLightsGrid() {
    lightsGridState = [
        true, false, false, true,
        false, true, true, false,
        false, true, true, false,
        true, false, false, true
    ];
    updateLightsGridUI();
}

function setupLightsGridListeners() {
    document.querySelectorAll('#lights-grid .light-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.cell, 10);
            toggleLightCellAndNeighbors(idx);
        });
    });

    const resetLightsBtn = document.getElementById('btn-reset-lights');
    if (resetLightsBtn) {
        resetLightsBtn.addEventListener('click', () => {
            sfx.click();
            initLightsGrid();
        });
    }
}

function toggleLightCellAndNeighbors(idx) {
    sfx.click();
    const row = Math.floor(idx / 4);
    const col = idx % 4;

    const toggle = (r, c) => {
        if (r >= 0 && r < 4 && c >= 0 && c < 4) {
            const targetIdx = r * 4 + c;
            lightsGridState[targetIdx] = !lightsGridState[targetIdx];
        }
    };

    toggle(row, col);
    toggle(row - 1, col);
    toggle(row + 1, col);
    toggle(row, col - 1);
    toggle(row, col + 1);

    updateLightsGridUI();

    if (lightsGridState.every(Boolean)) {
        sfx.success();
        gameState.solvedPuzzles.lights = true;
        unlockFragment(6, '8');
        closeAllModals();
        addItemToInventory('core_7');
        updateProgressBar();
        updateMapUI();
        showDialogue('❄️ Matriz activada al 100%. Obtienes el Núcleo Omega.');
        openInspectModal('Núcleo Omega', '❄️', ITEMS['core_7'].desc, null, '8');
    }
}

function updateLightsGridUI() {
    document.querySelectorAll('#lights-grid .light-cell').forEach((cell, idx) => {
        cell.classList.toggle('lit', lightsGridState[idx]);
    });
}

// --- PUZLE 8: LA BÓVEDA PRINCIPAL (SEC-08) ---
function handleVaultSlotPlacement(slotIndex) {
    if (gameState.placedCores[slotIndex]) {
        showDialogue(`El Altar ${slotIndex + 1} ya tiene su núcleo fijado.`);
        return;
    }

    openItemSelectionModal(
        `⚡ Altar Receptáculo 0${slotIndex + 1}`,
        `Pedestal de energía vacío. Selecciona el núcleo de tu inventario que deseas encajar aquí:`,
        `altar_${slotIndex}`
    );
}

function updateVaultSlotsUI() {
    const coreIcons = ['🔮', '💎', '🧩', '🎹', '🌀', '🛰️', '❄️'];
    gameState.placedCores.forEach((placed, idx) => {
        const slotEl = document.getElementById(`vslot-${idx + 1}`);
        if (slotEl) {
            if (placed) {
                slotEl.classList.add('filled');
                slotEl.textContent = coreIcons[idx];
            } else {
                slotEl.classList.remove('filled');
                slotEl.textContent = '🔒';
            }
        }
    });

    const count = gameState.placedCores.filter(Boolean).length;
    const statusEl = document.getElementById('master-status');
    if (statusEl) {
        statusEl.textContent = `ESTADO: ${count}/7 NÚCLEOS INSTALADOS`;
    }
}

function setupMasterCodeListeners() {
    document.querySelectorAll('#modal-mastercode .wheel-arrow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const wheel = parseInt(e.currentTarget.dataset.mwheel, 10);
            const dir = e.currentTarget.dataset.dir;
            sfx.gear();
            if (dir === 'up') {
                masterWheelValues[wheel] = (masterWheelValues[wheel] + 1) % 10;
            } else {
                masterWheelValues[wheel] = (masterWheelValues[wheel] - 1 + 10) % 10;
            }
            const mwheelVal = document.getElementById(`mwheel-${wheel}`);
            if (mwheelVal) mwheelVal.textContent = masterWheelValues[wheel];
        });
    });

    const checkBtn = document.getElementById('btn-check-mastercode');
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            const entered = masterWheelValues.join('');
            if (entered === PUZZLE_SOLUTIONS.masterCode) {
                sfx.victoryFanfare();
                gameState.solvedPuzzles.masterDoor = true;
                gameState.gameWon = true;
                closeAllModals();
                saveGameState();
                triggerVictoryScreen();
            } else {
                sfx.error();
                showDialogue('❌ Código maestro incorrecto.');
            }
        });
    }
}

// Pantalla Final de Victoria
function triggerVictoryScreen() {
    const timeEl = document.getElementById('victory-stat-time');
    const hintsEl = document.getElementById('victory-stat-hints');
    if (timeEl) timeEl.textContent = formatTime(gameState.timeElapsed);
    if (hintsEl) hintsEl.textContent = gameState.hintsUsed;

    openModal('modal-victory');
    createConfettiEffect();

    const audioEl = document.getElementById('audio-element');
    if (audioEl) {
        audioEl.play().catch(() => {
            console.log('Autoplay prevenido por el navegador.');
        });
    }
}

function createConfettiEffect() {
    const layer = document.getElementById('confetti-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const colors = ['#00f3ff', '#ffb700', '#ff0055', '#00ff88', '#b026ff'];

    for (let i = 0; i < 70; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece';
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = `${2.2 + Math.random() * 2.8}s`;
        confetti.style.animationDelay = `${Math.random() * 2}s`;
        layer.appendChild(confetti);
    }
}

// Persistencia en LocalStorage
function saveGameState() {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    } catch (e) {
        console.warn('No se pudo guardar la partida:', e);
    }
}

function loadGameState() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            gameState = Object.assign(gameState, parsed);
        } catch (e) {
            console.error('Error al cargar la partida:', e);
        }
    }
}

function resetGameState() {
    localStorage.removeItem(SAVE_KEY);
    gameState = {
        currentRoom: 1,
        inventory: [],
        selectedForCombine: [],
        placedCores: [false, false, false, false, false, false, false],
        unlockedDevices: {
            circuit: false,
            synth: false,
            pipes: false,
            codebreaker: false,
            lights: false
        },
        solvedPuzzles: {
            wordlock: false,
            circuit: false,
            safe: false,
            synth: false,
            pipes: false,
            codebreaker: false,
            lights: false,
            masterDoor: false
        },
        collectedHotspots: [],
        codexFragments: ['?', '?', '?', '?', '?', '?', '?'],
        timeElapsed: 0,
        hintsUsed: 0,
        gameStarted: false,
        gameWon: false
    };
    circuitSwitches = [false, false, false, false];
    currentSafeInput = '';
    currentSynthInput = [];
    pipeRotations = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    currentMastermindGuess = ['🔴', '🔴', '🔴', '🔴'];
    mastermindAttempts = 0;
    masterWheelValues = [0, 0, 0, 0, 0, 0, 0];
    initLightsGrid();
}
