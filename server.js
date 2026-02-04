const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// EMERGENCY FIX: Direct index.html load karo
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/search', (req, res) => {
    res.json([
        { id: "Bus 101", route: "RTU Campus to Railway Station", lat: 25.1381, lng: 75.8112, crowd: 12, eta: "5 mins" },
        { id: "Bus 102", route: "RTU Campus to Railway Station", lat: 25.1420, lng: 75.8200, crowd: 25, eta: "15 mins" }
    ]);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ CityNav Live on Port ${PORT}`);
});
