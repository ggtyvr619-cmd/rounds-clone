// --- CONFIGURATION ---
const APP_ID = "YOUR_APP_ID_HERE"; // PASTE YOUR ID HERE
const REGION = "us";

// --- PHYSICS SETUP ---
const { Engine, Render, Runner, Bodies, Composite, Body, Vector } = Matter;
const engine = Engine.create();
const world = engine.world;
const render = Render.create({
    element: document.body,
    engine: engine,
    options: { width: window.innerWidth, height: window.innerHeight, wireframes: false }
});

Render.run(render);
Runner.run(Runner.create(), engine);

// --- MULTIPLAYER LOGIC ---
class RoundsArena extends Photon.LoadBalancing.LoadBalancingClient {
    constructor() {
        super(Photon.ConnectionProtocol.Wss, APP_ID, "1.0");
        this.players = {}; // Local references to player bodies
        this.localPlayer = null;
    }

    onStateChange(state) {
        document.getElementById("status").innerText = Photon.LoadBalancing.LoadBalancingClient.StateToName(state);
        if (state === Photon.LoadBalancing.LoadBalancingClient.State.JoinedLobby) {
            this.joinOrCreateRoom("Arena1");
        }
    }

    onJoinRoom() {
        this.spawnPlayer(this.myActor().actorNr, true);
    }

    onActorJoin(actor) {
        this.spawnPlayer(actor.actorNr, false);
    }

    spawnPlayer(id, isLocal) {
        const x = isLocal ? 100 : 700;
        const playerBody = Bodies.rectangle(x, 300, 40, 60, { 
            friction: 0.1, 
            render: { fillStyle: isLocal ? '#3498db' : '#e74c3c' } 
        });
        
        Composite.add(world, playerBody);
        this.players[id] = playerBody;
        if (isLocal) this.localPlayer = playerBody;
    }

    // Send data to others
    sendUpdate() {
        if (!this.localPlayer) return;
        this.raiseEvent(1, { 
            x: this.localPlayer.position.x, 
            y: this.localPlayer.position.y,
            v: this.localPlayer.velocity 
        });
    }

    onEvent(code, content, actorNr) {
        if (code === 1 && this.players[actorNr]) {
            // Update remote player position
            Body.setPosition(this.players[actorNr], { x: content.x, y: content.y });
        }
    }
}

// --- INITIALIZE & CONTROLS ---
const arena = new RoundsArena();
arena.connectToRegionMaster(REGION);

const keys = {};
window.addEventListener("keydown", (e) => keys[e.code] = true);
window.addEventListener("keyup", (e) => keys[e.code] = false);

// Game Loop for Input & Sync
setInterval(() => {
    if (arena.localPlayer) {
        // Movement Logic
        if (keys['KeyA']) Body.setVelocity(arena.localPlayer, { x: -5, y: arena.localPlayer.velocity.y });
        if (keys['KeyD']) Body.setVelocity(arena.localPlayer, { x: 5, y: arena.localPlayer.velocity.y });
        if (keys['Space'] && Math.abs(arena.localPlayer.velocity.y) < 0.1) {
            Body.applyForce(arena.localPlayer, arena.localPlayer.position, { x: 0, y: -0.05 });
        }
        
        // Sync with Photon
        arena.sendUpdate();
    }
}, 1000 / 60);

// Add floor
Composite.add(world, Bodies.rectangle(window.innerWidth/2, window.innerHeight - 20, window.innerWidth, 40, { isStatic: true }));

