const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

const serviceAccount = require("./serviceAccountKey.json");
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Seed 16 Buses with ETA and Crowd
const seedBuses = async () => {
    console.log("⏳ Initializing CityNav Fleet...");
    const routes = ["RTU Campus to Railway Station", "Talwandi to Srinathpuram", "Nayapura to Nayagaon", "Bhagwan Nagar to Vishnu Nagar"];
    const batch = db.batch();
    
    routes.forEach((routeName, rIdx) => {
        for(let i=1; i<=4; i++) {
            const busId = `Bus ${rIdx + 1}0${i}`;
            const docId = busId.toLowerCase().replace(/\s+/g, '_');
            const crowdCount = Math.floor(Math.random() * 45); // Random initial crowd
            
            batch.set(db.collection('buses').doc(docId), {
                id: busId,
                route: routeName,
                lat: 25.1381 + (Math.random() - 0.5) * 0.02,
                lng: 75.8112 + (Math.random() - 0.5) * 0.02,
                crowd: crowdCount,
                eta: (i * 5) + " mins",
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });
    await batch.commit();
    console.log("✅ Fleet Ready!");
};

// Update Movement
setInterval(async () => {
    try {
        const snapshot = await db.collection('buses').get();
        let updates = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            let nLat = data.lat + (Math.random() - 0.5) * 0.0005;
            let nLng = data.lng + (Math.random() - 0.5) * 0.0005;
            updates.push({ ...data, lat: nLat, lng: nLng });
        });
        io.emit('bus_updates', updates);
    } catch (e) { console.error(e); }
}, 4000);

app.get('/api/search', async (req, res) => {
    const snap = await db.collection('buses').get();
    res.json(snap.docs.map(doc => doc.data()));
});
// Purane '/api/book-ticket' ko hata kar ye wala daal do:
app.post('/api/book-ticket', async (req, res) => {
    try {
        const { busId } = req.body;
        
        // Validation: Check karo busId mil raha hai ya nahi
        if (!busId) {
            return res.status(400).json({ success: false, message: "Bus ID is required" });
        }

        const tID = "NAV-" + Math.random().toString(36).substr(2, 6).toUpperCase();
        
        // 1. Ticket Firestore mein save karo
        await db.collection('tickets').doc(tID).set({ 
            tID, 
            busId, 
            status: "Valid",
            createdAt: new Date().toISOString() 
        });
        
        // 2. Bus ka crowd badhao
        const docId = busId.toLowerCase().replace(/\s+/g, '_');
        const busRef = db.collection('buses').doc(docId);
        
        // Check if bus exists before updating
        const busDoc = await busRef.get();
        if (busDoc.exists) {
            await busRef.update({ crowd: admin.firestore.FieldValue.increment(1) });
        }
        
        // 3. Success Response bhejo
        console.log(`✅ Ticket Generated: ${tID} for ${busId}`);
        res.json({ 
            success: true, 
            tID: tID, 
            qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${tID}` 
        });

    } catch (error) {
        console.error("❌ Booking Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});


    


app.post('/api/verify-ticket', async (req, res) => {
    const { ticketID } = req.body;
    const tRef = db.collection('tickets').doc(ticketID);
    const doc = await tRef.get();
    if (!doc.exists || doc.data().status === "Used") return res.json({ valid: false, message: "Invalid or Already Used!" });
    await tRef.update({ status: "Used" });
    res.json({ valid: true, message: "Verified! Welcome Aboard." });
});

server.listen(3001, () => { seedBuses(); console.log("Server: 3001"); });