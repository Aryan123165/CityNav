const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require("firebase-admin");

// Service Account setup
const serviceAccount = require("./serviceAccountKey.json"); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/**
 * 🚌 Seed 16 Buses with ETA and Crowd
 * Ise optimized kiya hai taaki data redundant na ho.
 */
const seedBuses = async () => {
    console.log("⏳ Initializing CityNav Fleet...");
    const routes = [
        "RTU Campus to Railway Station", 
        "Talwandi to Srinathpuram", 
        "Nayapura to Nayagaon", 
        "Bhagwan Nagar to Vishnu Nagar"
    ];
    
    const batch = db.batch();
    
    routes.forEach((routeName, rIdx) => {
        for(let i = 1; i <= 4; i++) {
            const busId = `Bus ${rIdx + 1}0${i}`;
            const docId = busId.toLowerCase().replace(/\s+/g, '_');
            const crowdCount = Math.floor(Math.random() * 45);
            
            const busRef = db.collection('buses').doc(docId);
            batch.set(busRef, {
                id: busId,
                route: routeName,
                lat: 25.1381 + (Math.random() - 0.5) * 0.02,
                lng: 75.8112 + (Math.random() - 0.5) * 0.02,
                crowd: crowdCount,
                eta: (i * 5) + " mins",
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); // Merge true se data override nahi hoga, sirf update hoga
        }
    });

    await batch.commit();
    console.log("✅ Fleet Ready & Syncing!");
};

/**
 * 📍 Real-time Movement Update (Every 4 Seconds)
 */
setInterval(async () => {
    try {
        const snapshot = await db.collection('buses').get();
        let updates = [];
        
        snapshot.forEach(doc => {
            let data = doc.data();
            // Simulating movement
            let nLat = data.lat + (Math.random() - 0.5) * 0.0005;
            let nLng = data.lng + (Math.random() - 0.5) * 0.0005;
            
            updates.push({ ...data, lat: nLat, lng: nLng });
        });
        
        io.emit('bus_updates', updates);
    } catch (e) { 
        console.error("❌ Socket Update Error:", e.message); 
    }
}, 4000);

// --- API ROUTES ---

// 1. Get All Buses
app.get('/api/search', async (req, res) => {
    try {
        const snap = await db.collection('buses').get();
        const buses = snap.docs.map(doc => doc.data());
        res.json(buses);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch buses" });
    }
});

// 2. Book Ticket & Increase Crowd
app.post('/api/book-ticket', async (req, res) => {
    try {
        const { busId } = req.body;
        
        if (!busId) {
            return res.status(400).json({ success: false, message: "Bus ID is required" });
        }

        const tID = "NAV-" + Math.random().toString(36).substr(2, 6).toUpperCase();
        const docId = busId.toLowerCase().replace(/\s+/g, '_');

        // Firestore Transaction use karna better hai crowd update ke liye
        await db.runTransaction(async (transaction) => {
            const busRef = db.collection('buses').doc(docId);
            const ticketRef = db.collection('tickets').doc(tID);

            const busDoc = await transaction.get(busRef);
            if (!busDoc.exists) throw "Bus not found!";

            // 1. Create Ticket
            transaction.set(ticketRef, { 
                tID, 
                busId, 
                status: "Valid",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Increment Crowd
            transaction.update(busRef, { 
                crowd: admin.firestore.FieldValue.increment(1) 
            });
        });

        console.log(`✅ Ticket Generated: ${tID} for ${busId}`);
        res.json({ 
            success: true, 
            tID: tID, 
            qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${tID}` 
        });

    } catch (error) {
        console.error("❌ Booking Error:", error);
        res.status(500).json({ success: false, message: error || "Database Error" });
    }
});

// 3. Verify Ticket (Used by Conductor/Machine)
app.post('/api/verify-ticket', async (req, res) => {
    try {
        const { ticketID } = req.body;
        const tRef = db.collection('tickets').doc(ticketID);
        const doc = await tRef.get();

        if (!doc.exists || doc.data().status === "Used") {
            return res.json({ valid: false, message: "Invalid or Already Used!" });
        }

        await tRef.update({ status: "Used" });
        res.json({ valid: true, message: "Verified! Welcome Aboard." });
    } catch (err) {
        res.status(500).json({ valid: false, message: "Verification failed" });
    }
});

// Server Listen
const PORT = 3001;
server.listen(PORT, () => { 
    seedBuses(); 
    console.log(`🚀 CityNav Server running on: http://localhost:${PORT}`); 
});
