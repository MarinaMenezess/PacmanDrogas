const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const messageArea = document.getElementById('message-area');
const drugNameElement = document.getElementById('drug-name');
const drugTypeElement = document.getElementById('drug-type');
const drugMessageElement = document.getElementById('drug-message');

const CELL_SIZE = 40;
const ROWS = 21;
const COLS = 21;
const FPS = 60;

canvas.width = COLS * CELL_SIZE;
canvas.height = ROWS * CELL_SIZE;

const BLACK = 'rgb(0, 0, 0)';
const BLUE = 'rgb(0, 0, 255)';
const YELLOW = 'rgb(255, 255, 0)';
const WHITE = 'rgb(255, 255, 255)';

const DIRS = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 }
];

let MAP = [];
let pacman = { x: 1, y: 1, direction: DIRS[1], desiredDirection: DIRS[1], moveCounter: 0, moveDelay: 8 };
let enemies = [];
let activeEffects = {};
let gameLoopInterval;
let isPaused = false;
let isPopupVisible = false;
let enemyMoveCounter = 0;
const ENEMY_MOVE_DELAY = 12;
const EFFECT_DURATION = 5 * FPS;

// Função shuffle movida para o escopo global para ser acessível por todas as funções
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateMaze(rows, cols) {
    const grid = Array(rows).fill(null).map(() => Array(cols).fill(1));
    
    function isValid(r, c) {
        return r > 0 && r < rows - 1 && c > 0 && c < cols - 1;
    }
    
    function getNeighbors(r, c) {
        const neighbors = [];
        const directions = [
            { dr: -2, dc: 0 }, { dr: 2, dc: 0 },
            { dr: 0, dc: -2 }, { dr: 0, dc: 2 }
        ];
        shuffle(directions);
        for (const dir of directions) {
            const nr = r + dir.dr;
            const nc = c + dir.dc;
            if (isValid(nr, nc) && grid[nr][nc] === 1) {
                neighbors.push({ r: nr, c: nc, wr: r + dir.dr / 2, wc: c + dir.dc / 2 });
            }
        }
        return neighbors;
    }

    function dfs(r, c) {
        grid[r][c] = 0;
        const neighbors = getNeighbors(r, c);
        for (const neighbor of neighbors) {
            if (grid[neighbor.r][neighbor.c] === 1) {
                grid[neighbor.wr][neighbor.wc] = 0;
                dfs(neighbor.r, neighbor.c);
            }
        }
    }

    dfs(1, 1);
    
    const extraConnections = 25;
    const walls = [];
    for (let r = 2; r < rows - 2; r++) {
        for (let c = 2; c < cols - 2; c++) {
            if (grid[r][c] === 1) {
                let adj = 0;
                for (const dir of DIRS) {
                    if (grid[r + dir.y][c + dir.x] === 0) {
                        adj++;
                    }
                }
                if (adj === 2) {
                    walls.push({ r, c });
                }
            }
        }
    }
    
    shuffle(walls);
    for (let i = 0; i < Math.min(extraConnections, walls.length); i++) {
        grid[walls[i].r][walls[i].c] = 0;
    }

    return grid;
}

class DrugEnemy {
    constructor(name, tipo, color, message, start_pos) {
        this.name = name;
        this.tipo = tipo;
        this.color = color;
        this.message = message;
        this.x = start_pos.x;
        this.y = start_pos.y;
        this.direction = DIRS[Math.floor(Math.random() * DIRS.length)];
    }

    move(grid) {
        let nx = this.x + this.direction.x;
        let ny = this.y + this.direction.y;
        
        if (this.isValid(nx, ny, grid)) {
            this.x = nx;
            this.y = ny;
        } else {
            const possibleDirs = [...DIRS];
            shuffle(possibleDirs);
            for (const d of possibleDirs) {
                nx = this.x + d.x;
                ny = this.y + d.y;
                if (this.isValid(nx, ny, grid)) {
                    this.direction = d;
                    this.x = nx;
                    this.y = ny;
                    break;
                }
            }
        }
    }

    isValid(x, y, grid) {
        return y >= 0 && y < ROWS && x >= 0 && x < COLS && grid[y][x] === 0;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x * CELL_SIZE + CELL_SIZE / 2, this.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

const drugData = [
    { name: "Cocaína", tipo: "Estimulante", color: 'rgb(255, 0, 0)', message: "Efeitos de curto prazo: euforia, aumento de energia, agitação.\nEfeitos de médio prazo: ansiedade, paranoia, insônia.\nEfeitos de longo prazo: problemas cardiovasculares, dependência.\nEfeito no jogo: Mais rápido e pulsante." },
    { name: "Metanfetamina", tipo: "Estimulante", color: 'rgb(255, 105, 180)', message: "Efeitos de curto prazo: euforia intensa, aumento de foco, hiperatividade.\nEfeitos de médio prazo: agressividade, perda de apetite, insônia crônica.\nEfeitos de longo prazo: danos cerebrais, perda dentária, dependência severa.\nEfeito no jogo: Mais rápido." },
    { name: "Álcool", tipo: "Depressora", color: 'rgb(128, 0, 128)', message: "Efeitos de curto prazo: relaxamento, perda de coordenação, fala arrastada.\nEfeitos de médio prazo: irritabilidade, gastrite, prejuízo na memória.\nEfeitos de longo prazo: cirrose, danos cerebrais, dependência.\nEfeito no jogo: Controles bagunçados, tela distorcida." },
    { name: "Sedativos", tipo: "Depressora", color: 'rgb(169, 169, 169)', message: "Efeitos de curto prazo: sonolência, relaxamento extremo, reflexos lentos.\nEfeitos de médio prazo: confusão mental, perda de memória, tolerância.\nEfeitos de longo prazo: dependência, depressão respiratória, risco de overdose.\nEfeito no jogo: Movimento lento, preto e branco." },
    { name: "LSD", tipo: "Perturbadora", color: 'rgb(144, 238, 144)', message: "Efeitos de curto prazo: alucinações visuais e auditivas, alteração da percepção do tempo.\nEfeitos de médio prazo: ansiedade, crises de pânico, flashbacks ocasionais.\nEfeitos de longo prazo: distúrbios perceptivos persistentes, possíveis gatilhos para transtornos mentais.\nEfeito no jogo: Cores vibrantes e deslocamento." },
    { name: "Maconha", tipo: "Perturbadora", color: 'rgb(34, 139, 34)', message: "Efeitos de curto prazo: relaxamento, alteração da percepção, aumento do apetite.\nEfeitos de médio prazo: prejuízo de memória, dificuldade de concentração, bronquite crônica em uso frequente.\nEfeitos de longo prazo: problemas respiratórios, alterações cognitivas, dependência psicológica.\nEfeito no jogo: Tela esverdeada com giros." }
];

function randomEmptyCell() {
    let x, y;
    do {
        x = Math.floor(Math.random() * (COLS - 2)) + 1;
        y = Math.floor(Math.random() * (ROWS - 2)) + 1;
    } while (MAP[y][x] !== 0 || (x === 1 && y === 1));
    return { x, y };
}

function createEnemy() {
    const data = drugData[Math.floor(Math.random() * drugData.length)];
    const pos = randomEmptyCell();
    return new DrugEnemy(data.name, data.tipo, data.color, data.message, pos);
}

function showPopup(enemy) {
    isPopupVisible = true;
    isPaused = true;
    messageArea.style.display = 'block';
    drugNameElement.textContent = `Droga: ${enemy.name}`;
    drugTypeElement.textContent = `Tipo: ${enemy.tipo}`;
    drugMessageElement.innerHTML = enemy.message.split('\n').map(line => `<p>${line}</p>`).join('');
}

function hidePopup() {
    isPopupVisible = false;
    isPaused = false;
    messageArea.style.display = 'none';
}

function gameLoop() {
    if (isPaused) return;
    
    // Atualiza timers dos efeitos e aplica a lógica
    let toRemove = [];
    for (const effect in activeEffects) {
        activeEffects[effect]--;
        if (activeEffects[effect] <= 0) {
            toRemove.push(effect);
        }
    }
    toRemove.forEach(effect => delete activeEffects[effect]);

    // Lógica de movimento do Pacman
    let currentDelay = pacman.moveDelay;
    if (activeEffects['Cocaína'] || activeEffects['Metanfetamina']) {
        currentDelay = pacman.moveDelay / 2;
    }
    if (activeEffects['Sedativos'] || activeEffects['Maconha']) {
        currentDelay = pacman.moveDelay * 2;
    }
    if (activeEffects['Álcool'] && Math.random() < 0.1) {
        pacman.desiredDirection = DIRS[Math.floor(Math.random() * DIRS.length)];
    }

    pacman.moveCounter++;
    if (pacman.moveCounter >= currentDelay) {
        pacman.moveCounter = 0;
        let nx = pacman.x + pacman.desiredDirection.x;
        let ny = pacman.y + pacman.desiredDirection.y;
        if (0 <= ny && ny < ROWS && 0 <= nx && nx < COLS && MAP[ny][nx] === 0) {
            pacman.direction = pacman.desiredDirection;
        }

        nx = pacman.x + pacman.direction.x;
        ny = pacman.y + pacman.direction.y;
        if (0 <= ny && ny < ROWS && 0 <= nx && nx < COLS && MAP[ny][nx] === 0) {
            pacman.x = nx;
            pacman.y = ny;
        }
    }

    // Lógica de movimento dos inimigos
    enemyMoveCounter++;
    if (enemyMoveCounter >= ENEMY_MOVE_DELAY) {
        enemyMoveCounter = 0;
        enemies.forEach(enemy => enemy.move(MAP));
    }

    // Limpa a tela
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Desenha o labirinto
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (MAP[r][c] === 1) {
                ctx.fillStyle = BLUE;
                ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    }

    // Lógica de colisão
    const newEnemies = [];
    for (const enemy of enemies) {
        if (enemy.x === pacman.x && enemy.y === pacman.y) {
            showPopup(enemy);
            activeEffects[enemy.name] = (activeEffects[enemy.name] || 0) + EFFECT_DURATION;
            newEnemies.push(createEnemy());
            newEnemies.push(createEnemy());
        } else {
            newEnemies.push(enemy);
        }
    }
    enemies = newEnemies;

    // Desenha os inimigos
    enemies.forEach(enemy => enemy.draw(ctx));
    
    // Desenha o Pacman
    ctx.fillStyle = YELLOW;
    ctx.beginPath();
    ctx.arc(pacman.x * CELL_SIZE + CELL_SIZE / 2, pacman.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 2 - 4, 0, Math.PI * 2);
    ctx.fill();

    // Lógica de desenho dos efeitos visuais específicos
    const now = Date.now();
    ctx.filter = 'none';

    if (activeEffects['Cocaína']) {
        const timeElapsed = (EFFECT_DURATION - activeEffects['Cocaína']) / FPS;
        const alpha = 0.2 + 0.2 * Math.sin(timeElapsed * 10);
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    if (activeEffects['Álcool']) {
        // Implementação de "tela distorcida"
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const shift = Math.floor(Math.random() * 5) - 2;
        const newImageData = ctx.createImageData(canvas.width, canvas.height);
        const newData = newImageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const y = Math.floor(i / (4 * canvas.width));
            const x = (i / 4) % canvas.width;
            const newY = y + shift;
            if (newY >= 0 && newY < canvas.height) {
                const newIndex = newY * canvas.width * 4 + x * 4;
                newData[i] = data[newIndex];
                newData[i + 1] = data[newIndex + 1];
                newData[i + 2] = data[newIndex + 2];
                newData[i + 3] = data[newIndex + 3];
            } else {
                 newData[i] = 0;
                 newData[i + 1] = 0;
                 newData[i + 2] = 0;
                 newData[i + 3] = 255;
            }
        }
        ctx.putImageData(newImageData, 0, 0);
    }

    if (activeEffects['Sedativos']) {
        // Efeito preto e branco (grayscale) e vinheta
        ctx.filter = 'grayscale(100%)';
        ctx.fillStyle = `rgba(0, 0, 0, 0.4)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    if (activeEffects['LSD']) {
        // Efeito de cores vibrantes e deslocamento
        const offset = 2 * Math.sin(now * 0.0015);
        ctx.filter = `hue-rotate(${now * 0.01}deg)`;
        ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.1)`;
        ctx.fillRect(offset, offset, canvas.width, canvas.height);
    }
    
    if (activeEffects['Maconha']) {
        // Efeito de tela esverdeada com giros
        const angle = Math.sin(now * 0.0008) * 2;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        
        ctx.fillStyle = `rgba(0, 255, 0, 0.2)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.restore();
    }
}

function init() {
    MAP = generateMaze(ROWS, COLS);
    enemies = Array(6).fill(null).map(() => createEnemy());
    gameLoopInterval = setInterval(gameLoop, 1000 / FPS);
}

document.addEventListener('keydown', (e) => {
    if (isPopupVisible) {
        hidePopup();
        return;
    }

    switch (e.key) {
        case 'ArrowUp':
            pacman.desiredDirection = DIRS[2];
            break;
        case 'ArrowDown':
            pacman.desiredDirection = DIRS[3];
            break;
        case 'ArrowLeft':
            pacman.desiredDirection = DIRS[0];
            break;
        case 'ArrowRight':
            pacman.desiredDirection = DIRS[1];
            break;
    }
});

init();