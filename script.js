const GAME_STATE_KEY = 'the_vault_game_state';

let gameState = {
    currentRoom: 1,
    maxUnlockedRoom: 1,
    inventory: [],
    selectedForCombine: [],
    solvedPuzzles: {
        wordlock: false,
        circuit: false,
        safe: false,
        synth: false,
        valves: false
    },
    placedCores: [false, false, false, false],
    discoveredItems: []
};

// ÍTEMS Y RECETAS DE COMBINACIÓN
const ITEMS = {
    'cable_rojo': { name: 'Cable Rojo', icon: '🧵', desc: 'Un trozo de cable aislado sin conector.' },
    'conector': { name: 'Conector', icon: '🔌', desc: 'Un terminal de cobre pequeño.' },
    'cable_reparado': { name: 'Cable Aislado', icon: '⚡', desc: 'Cable con conector listo para circuitos.' },
    'nota_synth': { name: 'Partitura Digital', icon: '📜', desc: 'Nota hallada en el cofre: "Secuencia audio: SOL - LA - DO - MI".' },
    'plano_valvulas': { name: 'Planos de Presión', icon: '📋', desc: 'Anotación: "Ajustar manómetros a la secuencia 5 - 3 - 8".' },
    'core_1': { name: 'Núcleo Alfa', icon: '🔮', desc: 'Núcleo energético hallado en el cofre del Sector 1.' },
    'core_2': { name: 'Núcleo Beta', icon: '💎', desc: 'Cristal energético recuperado del circuito del Sector 2.' },
    'core_3': { name: 'Núcleo Gamma', icon: '🧩', desc: 'Módulo extraído de la caja fuerte del Sector 3.' },
    'core_4': { name: 'Núcleo Delta', icon: '⭐', desc: 'Dispositivo liberado al igualar la presión en el Sector 5.' }
};

const RECIPES = [
    { ingredients: ['cable_rojo', 'conector'], result: 'cable_reparado' }
];

// SINTETIZADOR DE SONIDOS (WEB AUDIO API)
class CyberAudio {
    constructor() { this.ctx = null; }

    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }

    play(freq, type = 'sine', dur = 0.2) {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + dur);
    }

    click() { this.play(600, 'square', 0.03); }
    success() {
        this.play(523, 'sine', 0.1);
        setTimeout(() => this.play(659, 'sine', 0.1), 90);
        setTimeout(() => this.play(783, 'sine', 0.2), 180);
    }
    error() { this.play(140, 'sawtooth', 0.25); }
}

const audio = new CyberAudio();

const NOTE_FREQS = { 'DO': 261, 'RE': 293, 'MI': 329, 'FA': 349, 'SOL': 392, 'LA': 440, 'SI': 493 };
const SOLUTION_WORDLOCK = 'SAWS';
const SOLUTION_SAFE = '8492';
const SOLUTION_SYNTH = ['SOL', 'LA', 'DO', 'MI'];
const SOLUTION_VALVES = [5, 3, 8];

let currentSafeInput = '';
let currentWheelIndices = [0, 0, 0, 0];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
let currentSynthSequence = [];
let circuitSwitches = [false, false, false];
let valveValues = [0, 0, 0];
let pendingInspectItem = null;

document.addEventListener('DOMContentLoaded', () => {
    checkSavedGame();
    setupEventListeners();
});

function checkSavedGame() {
    const saved = localStorage.getItem(GAME_STATE_KEY);
    if (saved) document.getElementById('btn-continue').classList.remove('hidden');
}

function setupEventListeners() {
    document.getElementById('btn-start').addEventListener('click', () => { audio.click(); resetGameState(); startGame(); });
    document.getElementById('btn-continue').addEventListener('click', () => { audio.click(); loadGameState(); startGame(); });

    document.getElementById('btn-map').addEventListener('click', () => { audio.click(); openModal('modal-map'); updateMapUI(); });
    document.getElementById('btn-save').addEventListener('click', () => { audio.click(); saveGameState(); showDialogue('💾 Progreso guardado.'); });
    document.getElementById('btn-reset').addEventListener('click', () => { if(confirm('¿Reiniciar partida desde el inicio?')) { resetGameState(); location.reload(); } });
    document.getElementById('btn-hint').addEventListener('click', () => { audio.click(); openModal('modal-hints'); renderHints(); });

    document.querySelectorAll('.nav-arrow').forEach(a => {
        a.addEventListener('click', (e) => {
            audio.click();
            const target = parseInt(e.currentTarget.dataset.targetRoom);
            if (target > gameState.currentRoom && target > gameState.maxUnlockedRoom) {
                audio.error();
                showDialogue(`🔒 El Sector 0${target} está bloqueado. Resuelve las pruebas del sector actual para continuar.`);
            } else {
                changeRoom(target);
            }
        });
    });

    document.querySelectorAll('.map-node').forEach(mn => {
        mn.addEventListener('click', (e) => {
            const target = parseInt(e.currentTarget.dataset.gotoRoom);
            if (target <= gameState.maxUnlockedRoom) {
                audio.click();
                closeAllModals();
                changeRoom(target);
            } else {
                audio.error();
                showDialogue(`🔒 El Sector 0${target} está bloqueado.`);
            }
        });
    });

    document.querySelectorAll('.hotspot').forEach(hs => {
        hs.addEventListener('click', (e) => {
            audio.click();
            handleHotspotAction(e.currentTarget.dataset.action);
        });
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => { audio.click(); closeAllModals(); });
    });

    // Puzle 1: Wordlock
    document.querySelectorAll('.wheel-arrow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            rotateWheel(parseInt(e.currentTarget.dataset.wheel), e.currentTarget.dataset.dir);
        });
    });
    document.getElementById('btn-check-wordlock').addEventListener('click', checkWordlockSolution);

    // Puzle 2: Circuitos
    document.querySelectorAll('.switch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.sw);
            circuitSwitches[idx] = !circuitSwitches[idx];
            updateCircuitUI();
        });
    });
    document.getElementById('btn-check-circuit').addEventListener('click', checkCircuitSolution);

    // Puzle 3: Safe
    document.querySelectorAll('.keypad-grid .key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleKeypadInput(e.currentTarget.dataset.key));
    });

    // Puzle 4: Sintetizador
    document.querySelectorAll('.synth-key').forEach(key => {
        key.addEventListener('click', (e) => pressSynthNote(e.currentTarget.dataset.note));
    });
    document.getElementById('btn-reset-synth').addEventListener('click', () => {
        audio.click(); currentSynthSequence = []; updateSynthDisplay();
    });

    // Puzle 5: Válvulas
    document.querySelectorAll('.btn-valve').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.valve);
            valveValues[idx] = (valveValues[idx] + 1) % 10;
            document.getElementById(`valve-${idx}`).textContent = valveValues[idx];
        });
    });
    document.getElementById('btn-check-valves').addEventListener('click', checkValvesSolution);

    // Combinador e inventario
    document.getElementById('btn-combine').addEventListener('click', tryCombineItems);
    document.getElementById('btn-collect-item').addEventListener('click', () => {
        audio.click();
        if (pendingInspectItem) {
            if (gameState.inventory.length >= 6) {
                audio.error();
                showDialogue('⚠️ Tu inventario está lleno (máximo 6 objetos).');
            } else {
                addItemToInventory(pendingInspectItem);
                pendingInspectItem = null;
                closeAllModals();
            }
        }
    });

    document.querySelectorAll('.vault-slot').forEach(slot => {
        slot.addEventListener('click', (e) => {
            handleVaultSlotClick(parseInt(e.currentTarget.dataset.vslot) - 1);
        });
    });

    document.getElementById('btn-restart-game').addEventListener('click', () => {
        resetGameState();
        location.reload();
    });
}

function changeRoom(roomNum) {
    gameState.currentRoom = roomNum;
    if (roomNum > gameState.maxUnlockedRoom) {
        gameState.maxUnlockedRoom = roomNum;
    }

    document.querySelectorAll('.room-view').forEach(r => r.classList.remove('active'));
    document.getElementById(`room-${roomNum}`).classList.add('active');

    const names = { 1: 'Taller', 2: 'Circuito', 3: 'Archivo', 4: 'Estudio Audio', 5: 'Planta Fluidos', 6: 'Núcleo Bóveda' };
    document.getElementById('room-code-tag').textContent = `SEC-0${roomNum}`;
    document.getElementById('current-room-title').textContent = names[roomNum];
    showDialogue(`Entrando en Sector 0${roomNum}: ${names[roomNum]}`);
    autoSave();
}

function startGame() {
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    changeRoom(gameState.currentRoom);
    updateInventoryUI();
    updateVaultSlotsUI();
}

function handleHotspotAction(action) {
    switch(action) {
        case 'inspect-workbench':
            if (!hasItem('cable_rojo') && !gameState.discoveredItems.includes('cable_rojo')) {
                showDialogue('Encuentras un cable rojo suelto sobre la mesa.');
                openInspectModal('Cable Rojo', '🧵', ITEMS['cable_rojo'].desc, 'cable_rojo');
            } else {
                showDialogue('Mesa de trabajo llena de piezas sueltas.');
            }
            break;

        case 'inspect-panel-floor':
            if (!hasItem('conector') && !gameState.discoveredItems.includes('conector')) {
                showDialogue('Al levantar la tapa suelta hallas un conector pequeño.');
                openInspectModal('Conector', '🔌', ITEMS['conector'].desc, 'conector');
            } else {
                showDialogue('Espacio en el suelo donde estaba el conector.');
            }
            break;

        case 'inspect-terminal':
            showDialogue('En la pantalla parpadea el mensaje: "CÓDIGO DEL COFRE = SAWS".');
            break;

        case 'open-chest-modal':
            if (gameState.solvedPuzzles.wordlock) {
                showDialogue('El cofre ya está abierto. Ya recogiste el Núcleo Alfa.');
            } else {
                openModal('modal-wordlock');
            }
            break;

        case 'open-circuit-modal':
            if (gameState.solvedPuzzles.circuit) {
                showDialogue('El puente de circuitos ya fue activado.');
            } else {
                openModal('modal-circuit');
            }
            break;

        case 'inspect-server':
            showDialogue('Servidor con etiquetas de mantenimiento. Una indica: "CLAVE DE SEGURIDAD = 8492".');
            break;

        case 'inspect-archives':
            if (!hasItem('plano_valvulas') && !gameState.discoveredItems.includes('plano_valvulas')) {
                openInspectModal('Planos de Presión', '📋', ITEMS['plano_valvulas'].desc, 'plano_valvulas');
            } else {
                showDialogue('Estantes llenos de carpetas de planos viejos.');
            }
            break;

        case 'open-safe-modal':
            if (gameState.solvedPuzzles.safe) {
                showDialogue('La caja fuerte ya fue saqueada.');
            } else {
                currentSafeInput = '';
                updateSafeDisplay();
                openModal('modal-safe');
            }
            break;

        case 'open-synth-modal':
            if (gameState.solvedPuzzles.synth) {
                showDialogue('El sintetizador ya está sincronizado.');
            } else {
                currentSynthSequence = [];
                updateSynthDisplay();
                openModal('modal-synth');
            }
            break;

        case 'inspect-speakers':
            showDialogue('Monitores de estudio. Si solucionas el sintetizador desbloquearás la siguiente sala.');
            break;

        case 'open-valves-modal':
            if (gameState.solvedPuzzles.valves) {
                showDialogue('El sistema de válvulas ya fue regulado.');
            } else {
                openModal('modal-valves');
            }
            break;

        case 'inspect-drain':
            showDialogue('Rejilla de drenaje técnico.');
            break;

        case 'inspect-master-door':
            checkMasterDoorUnlock();
            break;
    }
}

// LÓGICA DE PUZLES
function rotateWheel(index, dir) {
    audio.click();
    if (dir === 'up') currentWheelIndices[index] = (currentWheelIndices[index] + 1) % ALPHABET.length;
    else currentWheelIndices[index] = (currentWheelIndices[index] - 1 + ALPHABET.length) % ALPHABET.length;
    document.getElementById(`wheel-${index}`).textContent = ALPHABET[currentWheelIndices[index]];
}

function checkWordlockSolution() {
    const word = currentWheelIndices.map(i => ALPHABET[i]).join('');
    if (word === SOLUTION_WORDLOCK) {
        audio.success();
        gameState.solvedPuzzles.wordlock = true;
        closeAllModals();
        showDialogue('🔓 ¡Cofre abierto! Obtienes el Núcleo Alfa y una Partitura Digital. Sector 02 desbloqueado.');
        addItemToInventory('nota_synth');
        openInspectModal('Núcleo Alfa', '🔮', ITEMS['core_1'].desc, 'core_1');
        unlockNextSector(2);
    } else {
        audio.error();
        showDialogue('❌ Código alfabético incorrecto.');
    }
}

function updateCircuitUI() {
    audio.click();
    let voltage = 0;
    circuitSwitches.forEach((val, idx) => {
        const btn = document.getElementById(`sw-${idx}`);
        if (val) {
            btn.classList.add('on');
            btn.textContent = 'ON';
            voltage += 80;
        } else {
            btn.classList.remove('on');
            btn.textContent = 'OFF';
        }
    });
    document.getElementById('circuit-voltage').textContent = `VOLTAJE: ${voltage}V / 240V`;
}

function checkCircuitSolution() {
    if (!hasItem('cable_reparado')) {
        audio.error();
        showDialogue('⚠️ Necesitas un "Cable Aislado" en tu inventario para realizar el puenteado.');
        return;
    }

    if (circuitSwitches.every(s => s === true)) {
        audio.success();
        gameState.solvedPuzzles.circuit = true;
        removeItemFromInventory('cable_reparado');
        closeAllModals();
        showDialogue('⚡ Circuitos alimentados. Obtienes el Núcleo Beta. Sector 03 desbloqueado.');
        openInspectModal('Núcleo Beta', '💎', ITEMS['core_2'].desc, 'core_2');
        unlockNextSector(3);
    } else {
        audio.error();
        showDialogue('❌ Enciende los 3 interruptores para alcanzar 240V.');
    }
}

function handleKeypadInput(key) {
    audio.click();
    if (key === 'C') currentSafeInput = '';
    else if (key === 'OK') {
        if (currentSafeInput === SOLUTION_SAFE) {
            audio.success();
            gameState.solvedPuzzles.safe = true;
            closeAllModals();
            showDialogue('🔓 Caja Fuerte abierta. Obtienes el Núcleo Gamma. Sector 04 desbloqueado.');
            openInspectModal('Núcleo Gamma', '🧩', ITEMS['core_3'].desc, 'core_3');
            unlockNextSector(4);
        } else {
            audio.error();
            showDialogue('❌ Clave de seguridad incorrecta.');
            currentSafeInput = '';
        }
    } else {
        if (currentSafeInput.length < 4) currentSafeInput += key;
    }
    updateSafeDisplay();
}

function updateSafeDisplay() {
    document.getElementById('safe-display').textContent = currentSafeInput.padEnd(4, '_');
}

function pressSynthNote(note) {
    if (NOTE_FREQS[note]) audio.play(NOTE_FREQS[note], 'sine', 0.3);
    if (currentSynthSequence.length < 4) {
        currentSynthSequence.push(note);
        updateSynthDisplay();
    }
    if (currentSynthSequence.length === 4) {
        setTimeout(checkSynthSolution, 300);
    }
}

function updateSynthDisplay() {
    document.querySelector('#synth-history span').textContent = currentSynthSequence.length ? currentSynthSequence.join(' - ') : '----';
}

function checkSynthSolution() {
    const isOk = currentSynthSequence.every((n, i) => n === SOLUTION_SYNTH[i]);
    if (isOk) {
        audio.success();
        gameState.solvedPuzzles.synth = true;
        closeAllModals();
        showDialogue('🎹 Sintetizador sincronizado. Sector 05 desbloqueado.');
        unlockNextSector(5);
    } else {
        audio.error();
        showDialogue('❌ Secuencia incorrecta.');
        currentSynthSequence = [];
        updateSynthDisplay();
    }
}

function checkValvesSolution() {
    const isOk = valveValues.every((v, i) => v === SOLUTION_VALVES[i]);
    if (isOk) {
        audio.success();
        gameState.solvedPuzzles.valves = true;
        closeAllModals();
        showDialogue('🚰 Presión equilibrada. Obtienes el Núcleo Delta. Sector 06 desbloqueado.');
        openInspectModal('Núcleo Delta', '⭐', ITEMS['core_4'].desc, 'core_4');
        unlockNextSector(6);
    } else {
        audio.error();
        showDialogue('❌ Presión descompensada. Consulta los Planos de Presión.');
    }
}

function unlockNextSector(sectorNum) {
    if (sectorNum > gameState.maxUnlockedRoom) {
        gameState.maxUnlockedRoom = sectorNum;
        autoSave();
    }
}

// INVENTARIO Y COMBINACIÓN
function addItemToInventory(itemId) {
    if (!gameState.inventory.includes(itemId)) {
        gameState.inventory.push(itemId);
        gameState.discoveredItems.push(itemId);
        updateInventoryUI();
        autoSave();
    }
}

function hasItem(itemId) { return gameState.inventory.includes(itemId); }

function removeItemFromInventory(itemId) {
    gameState.inventory = gameState.inventory.filter(i => i !== itemId);
    gameState.selectedForCombine = gameState.selectedForCombine.filter(i => i !== itemId);
    updateInventoryUI();
    autoSave();
}

function updateInventoryUI() {
    const slots = document.querySelectorAll('#inventory-slots .slot-item');
    document.getElementById('inv-count').textContent = gameState.inventory.length;

    slots.forEach((slot, idx) => {
        slot.className = 'slot-item';
        slot.innerHTML = '';
        slot.onclick = null;

        if (idx < gameState.inventory.length) {
            const itemId = gameState.inventory[idx];
            const item = ITEMS[itemId];
            if (item) {
                slot.classList.add('filled');
                if (gameState.selectedForCombine.includes(itemId)) slot.classList.add('selected');
                slot.innerHTML = item.icon;
                slot.onclick = () => toggleSelectForCombine(itemId);
            }
        }
    });

    document.getElementById('btn-combine').textContent = `⚡ COMBINAR (${gameState.selectedForCombine.length})`;
}

function toggleSelectForCombine(itemId) {
    audio.click();
    if (gameState.selectedForCombine.includes(itemId)) {
        gameState.selectedForCombine = gameState.selectedForCombine.filter(i => i !== itemId);
    } else {
        if (gameState.selectedForCombine.length < 2) {
            gameState.selectedForCombine.push(itemId);
        }
    }
    updateInventoryUI();
}

function tryCombineItems() {
    if (gameState.selectedForCombine.length !== 2) {
        showDialogue('Selecciona exactamente 2 objetos de tu inventario para intentar combinarlos.');
        return;
    }

    const [itemA, itemB] = gameState.selectedForCombine;
    const recipe = RECIPES.find(r => 
        (r.ingredients.includes(itemA) && r.ingredients.includes(itemB))
    );

    if (recipe) {
        audio.success();
        removeItemFromInventory(itemA);
        removeItemFromInventory(itemB);
        addItemToInventory(recipe.result);
        gameState.selectedForCombine = [];
        showDialogue(`✨ ¡Has combinado los objetos para crear: ${ITEMS[recipe.result].name}!`);
    } else {
        audio.error();
        showDialogue('❌ Esos objetos no se pueden combinar.');
        gameState.selectedForCombine = [];
        updateInventoryUI();
    }
}

// BÓVEDA FINAL
function handleVaultSlotClick(slotIndex) {
    if (gameState.placedCores[slotIndex]) {
        showDialogue(`El receptáculo ${slotIndex + 1} ya tiene su núcleo instalado.`);
        return;
    }

    const coreReq = [`core_1`, `core_2`, `core_3`, `core_4`][slotIndex];
    if (hasItem(coreReq)) {
        audio.success();
        removeItemFromInventory(coreReq);
        gameState.placedCores[slotIndex] = true;
        updateVaultSlotsUI();
        showDialogue(`⚡ Núcleo ${slotIndex + 1} insertado con éxito.`);
    } else {
        audio.error();
        showDialogue(`Necesitas el Núcleo energéticamente correspondiente para este receptáculo.`);
    }
}

function updateVaultSlotsUI() {
    const icons = ['🔮', '💎', '🧩', '⭐'];
    gameState.placedCores.forEach((placed, idx) => {
        const slotEl = document.getElementById(`vslot-${idx + 1}`);
        if (placed) {
            slotEl.classList.add('filled');
            slotEl.textContent = icons[idx];
        } else {
            slotEl.classList.remove('filled');
            slotEl.textContent = '🔒';
        }
    });

    const count = gameState.placedCores.filter(Boolean).length;
    document.getElementById('master-status').textContent = `ESTADO: ${count}/4 NÚCLEOS INSTALADOS`;
}

function checkMasterDoorUnlock() {
    if (gameState.placedCores.every(c => c === true)) {
        audio.success();
        triggerVictory();
    } else {
        audio.error();
        showDialogue('🔒 La compuerta blindada requiere los 4 Núcleos en la consola central.');
    }
}

function triggerVictory() {
    openModal('modal-victory');
    const audioEl = document.getElementById('audio-element');
    if (audioEl) audioEl.play().catch(() => {});
}

function updateMapUI() {
    document.querySelectorAll('.map-node').forEach((mn, idx) => {
        const roomNum = idx + 1;
        if (roomNum <= gameState.maxUnlockedRoom) {
            mn.classList.add('active');
        } else {
            mn.classList.remove('active');
        }
    });
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden')); }

function openInspectModal(title, icon, desc, itemId = null) {
    document.getElementById('inspect-title').textContent = title;
    document.getElementById('inspect-icon').textContent = icon;
    document.getElementById('inspect-text').textContent = desc;

    const btn = document.getElementById('btn-collect-item');
    if (itemId && !hasItem(itemId)) {
        pendingInspectItem = itemId;
        btn.classList.remove('hidden');
    } else {
        pendingInspectItem = null;
        btn.classList.add('hidden');
    }
    openModal('modal-inspect');
}

function renderHints() {
    const container = document.getElementById('hints-list');
    let hints = [];

    if (!hasItem('cable_reparado') && !gameState.solvedPuzzles.circuit) {
        hints.push('💡 Sector 1: Inspecciona la mesa de trabajo y la tapa suelta. Luego pulsa "COMBINAR".');
    }
    if (!gameState.solvedPuzzles.wordlock) {
        hints.push('💡 Sector 1: Revisa la terminal de control para descubrir el código alfabético del cofre.');
    }
    if (!gameState.solvedPuzzles.circuit) {
        hints.push('💡 Sector 2: Necesitas el "Cable Aislado" en tu inventario para activar el puente de circuitos.');
    }
    if (!gameState.solvedPuzzles.safe) {
        hints.push('💡 Sector 3: Inspecciona los servidores del Sector 2 para ver la clave numérica de la caja fuerte.');
    }
    if (!gameState.solvedPuzzles.synth) {
        hints.push('💡 Sector 4: Revisa en tu inventario la "Partitura Digital" obtenida al abrir el cofre del Sector 1.');
    }
    if (!gameState.solvedPuzzles.valves) {
        hints.push('💡 Sector 5: Inspecciona los estantes del Sector 3 para hallar los Planos de Presión.');
    }

    container.innerHTML = hints.length ? hints.map(h => `<p style="margin-bottom:8px; font-size:12px;">${h}</p>`).join('') : '<p>¡Puzles resueltos! Dirígete a la Bóveda del Sector 6.</p>';
}

showDialogue = function(txt) { document.getElementById('dialogue-text').textContent = txt; };
autoSave = function() { saveGameState(); };
saveGameState = function() { localStorage.setItem(GAME_STATE_KEY, JSON.stringify(gameState)); };

loadGameState = function() {
    const saved = localStorage.getItem(GAME_STATE_KEY);
    if (saved) {
        try {
            gameState = JSON.parse(saved);
        } catch(e) {}
    }
};

resetGameState = function() {
    localStorage.removeItem(GAME_STATE_KEY);
    gameState = {
        currentRoom: 1,
        maxUnlockedRoom: 1,
        inventory: [],
        selectedForCombine: [],
        solvedPuzzles: { wordlock: false, circuit: false, safe: false, synth: false, valves: false },
        placedCores: [false, false, false, false],
        discoveredItems: []
    };
};