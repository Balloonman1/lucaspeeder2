// Local MQTT-over-WebSocket relay for testing multiplayer: node tools/test-broker.mjs  (ws://localhost:8883)
import aedesPkg from 'aedes';
import { WebSocketServer, createWebSocketStream } from 'ws';
const aedes = aedesPkg.createBroker ? await aedesPkg.createBroker() : (aedesPkg.Aedes ? await aedesPkg.Aedes.createBroker() : aedesPkg());
const wss = new WebSocketServer({ port: 8883 });
wss.on('connection', ws => aedes.handle(createWebSocketStream(ws)));
console.log('test relay on ws://localhost:8883');
