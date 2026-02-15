// --- CONFIGURATION ---
const APP_ID = "0e2a63a4-eeed-43f5-b3c0-9f4e74c997b6"; 
const REGION = "us";

// --- GAME SETTINGS ---
const CARDS = [
    { name: "BLOCK RELOAD", desc: "Blocking heals you", mod: (p) => { p.blockHeals = true; }},
    { name: "BUCKSHOT", desc: "Fire 3 bullets at once", mod: (p) => { p.multishot = 3; p.bulletSpeed = 12; }},
    { name: "POISON", desc: "Slows enemies on hit", mod: (p) => { p.damage += 5; p.isPoison = true; }},
    { name: "BOUNCY", desc: "Bullets bounce off walls", mod: (p) => { p.bounces = 3; }},
    { name: "TITAN", desc: "Huge HP and size", mod: (p) => { Matter.Body.scale(p.body, 1.8, 1.8); p.maxHp += 100; p.hp = p.maxHp; }}
];

// --- PHYSICS ENGINE ---
const { Engine, Render, Runner, Bodies, Composite, Body, Vector, Events } = Matter;
const engine = Engine.create();
const world = engine.world;
const render = Render.create({
    element: document.body,
    engine: engine,
    options: { width: window.innerWidth, height: window.innerHeight, wireframes: false, background: '#0f0f0f' }
});

Render.run(render);
Runner.run(Runner.create(), engine);

class RoundsFull extends Photon.LoadBalancing.LoadBalancingClient {
    constructor() {
        super(Photon.ConnectionProtocol.Wss, APP_ID, "1.0");
        this.players = {}; 
        this.localPlayer = null;
        this.lastFired = 0;
        this.lastBlock = 0;
    }

    onStateChange(state) {
        document.getElementById("status").innerText = Photon.LoadBalancing.LoadBalancingClient.StateToName(state);
        if (state === Photon.LoadBalancing.LoadBalancingClient.State.JoinedLobby) this.joinOrCreateRoom("ProRounds");
    }

    onJoinRoom() { this.spawnPlayer(this.myActor().actorNr, true); }
    onActorJoin(actor) { this.spawnPlayer(actor.actorNr, false); }

    spawnPlayer(id, isLocal) {
        const x = isLocal ? 300 : window.innerWidth - 300;
        const body = Bodies.rectangle(x, 200, 45, 65, { 
            friction: 0.05, restitution: 0.2, label: "player",
            render: { fillStyle: isLocal ? '#3498db' : '#e74c3c', strokeStyle: '#fff', lineWidth: 2 } 
        });
        
        const data = {
            id: id, body: body, hp: 100, maxHp: 100,
            bulletSize: 7, bulletSpeed: 20, moveSpeed: 6, jumpPower: -0.1,
            fireDelay: 500, blockDelay: 2000, isBlocking: false,
            multishot: 1, damage: 25, blockHeals: false
        };

        Composite.add(world, body);
        this.players[id] = data;
        if (isLocal) this.localPlayer = data;
    }

    onEvent(code, content, actorNr) {
        const p = this.players[actorNr];
        if (!p) return;

        if (code === 1) { // Sync Position
            Body.setPosition(p.body, content.pos);
            Body.setVelocity(p.body, content.vel);
            p.isBlocking = content.blocking;
            p.body.render.opacity = p.isBlocking ? 0.5 : 1;
        } else if (code === 2) { // Sync Bullet
            this.fire(content.x, content.y, content.angle, p, false);
        } else if (code === 3) { // Take Damage
            if (this.myActor().actorNr === content.targetId) this.takeDamage(content.dmg);
        } else if (code === 10) { // Round Reset
            location.reload(); 
        }
    }

    fire(x, y, angle, stats, isLocal) {
        for(let i=0; i < stats.multishot; i++) {
            const spread = (i - (stats.multishot-1)/2) * 0.1;
            const bullet = Bodies.circle(x, y, stats.bulletSize, {
                frictionAir: 0, label: "bullet",
                render: { fillStyle: isLocal ? '#f1c40f' : '#fff' }
            });
            const v = { x: Math.cos(angle + spread) * stats.bulletSpeed, y: Math.sin(angle + spread) * stats.bulletSpeed };
            Body.setVelocity(bullet, v);
            bullet.damage = stats.damage;
            Composite.add(world, bullet);
            setTimeout(() => Composite.remove(world, bullet), 2000);
        }
    }

    takeDamage(amount) {
        if (this.localPlayer.isBlocking) {
            if (this.localPlayer.blockHeals) this.localPlayer.hp = Math.min(this.localPlayer.maxHp, this.localPlayer.hp + 10);
            return;
        }
        this.localPlayer.hp -= amount;
        if (this.localPlayer.hp <= 0) {
            this.raiseEvent(3, { targetId: "ALL", winner: true });
            showCardSelection();
        }
    }
}

const game = new RoundsFull();
game.connectToRegionMaster(REGION);

// --- INPUT HANDLERS ---
const keys = {};
window.onkeydown = (e) => keys[e.code] = true;
window.onkeyup = (e) => keys[e.code] = false;

window.onmousedown = (e) => {
    if (e.button === 0 && Date.now() - game.lastFired > game.localPlayer.fireDelay) {
        const p = game.localPlayer;
        const angle = Math.atan2(e.clientY - p.body.position.y, e.clientX - p.body.position.x);
        game.fire(p.body.position.x, p.body.position.y, angle, p, true);
        game.raiseEvent(2, { x: p.body.position.x, y: p.body.position.y, angle: angle });
        game.lastFired = Date.now();
    }
    if (e.button === 2 && Date.now() - game.lastBlock > game.localPlayer.blockDelay) {
        game.localPlayer.isBlocking = true;
        game.lastBlock = Date.now();
        setTimeout(() => game.localPlayer.isBlocking = false, 500);
    }
};
window.oncontextmenu = (e) => e.preventDefault();

// --- CORE LOOP ---
setInterval(() => {
    if (!game.localPlayer) return;
    const p = game.localPlayer;
    
    if (keys['KeyA']) Body.setVelocity(p.body, { x: -p.moveSpeed, y: p.body.velocity.y });
    if (keys['KeyD']) Body.setVelocity(p.body, { x: p.moveSpeed, y: p.body.velocity.y });
    if (keys['Space'] && Math.abs(p.body.velocity.y) < 0.5) Body.applyForce(p.body, p.body.position, { x: 0, y: p.jumpPower });

    game.raiseEvent(1, { pos: p.body.position, vel: p.body.velocity, blocking: p.isBlocking });
    
    // UI Update
    document.getElementById("hp-local").style.width = (p.hp / p.maxHp * 100) + "%";
    for (let id in game.players) {
        if (id != game.myActor().actorNr) {
             document.getElementById("hp-remote").style.width = "100%"; // Simplified remote HP tracking
        }
    }
}, 1000 / 60);

// --- COLLISIONS ---
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const bullet = bodyA.label === "bullet" ? bodyA : (bodyB.label === "bullet" ? bodyB : null);
        const player = bodyA.label === "player" ? bodyA : (bodyB.label === "player" ? bodyB : null);

        if (bullet && player) {
            // Check if player is the local one
            if (player === game.localPlayer.body) {
                game.takeDamage(bullet.damage || 20);
            }
            Composite.remove(world, bullet);
        }
    });
});

function showCardSelection() {
    const overlay = document.getElementById("card-overlay");
    const container = document.getElementById("card-container");
    container.innerHTML = "";
    overlay.style.display = "flex";
    const shuffled = [...CARDS].sort(() => 0.5 - Math.random()).slice(0, 3);
    shuffled.forEach(card => {
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `<h3>${card.name}</h3><p>${card.desc}</p>`;
        div.onclick = () => {
            card.mod(game.localPlayer);
            overlay.style.display = "none";
            game.localPlayer.hp = game.localPlayer.maxHp;
        };
        container.appendChild(div);
    });
}

// Floor
Composite.add(world, [
    Bodies.rectangle(window.innerWidth/2, window.innerHeight - 20, window.innerWidth, 40, { isStatic: true, render: { fillStyle: '#222' } }),
    Bodies.rectangle(400, 500, 300, 20, { isStatic: true, render: { fillStyle: '#222' } }),
    Bodies.rectangle(window.innerWidth-400, 500, 300, 20, { isStatic: true, render: { fillStyle: '#222' } })
]);
