const express = require('express')
const app = express()
const mongoose = require('mongoose')
const userRoutes = require('./routes/userRoutes.js');
const GroupMessage = require('./models/GroupMessage');
const PrivateMessage = require('./models/PrivateMessage');

const PORT = process.env.PORT || 3000

app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('view'));

const MONGO_URI = 'YOUR_MONGO_URI_HERE';

const connectDB = async() => {
    try{
        console.log(`Attempting to connect to DB`);

        mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        }).then( () => {
            console.log(`MongoDB connected`)
        }).catch( (err) => {
            console.log(`Error while connecting to MongoDB : ${JSON.stringify(err)}`)
        });
    }catch(error){
        console.log(`Unable to connect to DB : ${error.message}`);
    }
}

const onServerStart = () => {
    console.log(`The server started running at http://localhost:${PORT}`);

    connectDB()
}

app.use(userRoutes);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/view/login.html');
})

app.get('/signup', (req, res) => {
    res.sendFile(__dirname + '/view/signup.html');
})

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/view/login.html');
})

app.get('/chat', (req, res) => {
    res.sendFile(__dirname + '/view/chat.html');
})

const express_server = app.listen(PORT, onServerStart)
const ioServer = require('socket.io')(express_server);
const users = {};

ioServer.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);

    socket.on('register_user', (username) => {
        users[socket.id] = { username: username, room: null };
        console.log(`User registered: ${username}`);
    });

    // Join a room
    socket.on('join_room', async (room) => {
        if (users[socket.id]) {
            // Leave previous room if any
            const prevRoom = users[socket.id].room;
            if (prevRoom) {
                socket.leave(prevRoom);
                ioServer.to(prevRoom).emit('user_left', {
                    username: users[socket.id].username,
                    room: prevRoom
                });
                // Update room members
                const membersInPrev = getRoomMembers(prevRoom);
                ioServer.to(prevRoom).emit('room_members', membersInPrev);
            }

            users[socket.id].room = room;
            socket.join(room);

            const username = users[socket.id].username;

            ioServer.to(room).emit('user_joined', {
                username: username,
                room: room
            });

            // Send room members list
            const members = getRoomMembers(room);
            ioServer.to(room).emit('room_members', members);

            // Load previous messages for the room
            try {
                const messages = await GroupMessage.find({ room: room })
                    .sort({ date_sent: 1 })
                    .limit(50);
                socket.emit('load_messages', messages);
            } catch (err) {
                console.log('Error loading messages:', err);
            }

            console.log(`${username} joined room: ${room}`);
        }
    });

    socket.on('leave_room', () => {
        if (users[socket.id] && users[socket.id].room) {
            const room = users[socket.id].room;
            const username = users[socket.id].username;

            socket.leave(room);
            users[socket.id].room = null;

            ioServer.to(room).emit('user_left', {
                username: username,
                room: room
            });

            // Update room members
            const members = getRoomMembers(room);
            ioServer.to(room).emit('room_members', members);

            console.log(`${username} left room: ${room}`);
        }
    });

    socket.on('group_message', async (data) => {
        if (users[socket.id] && users[socket.id].room) {
            const messageData = {
                from_user: data.from_user,
                room: users[socket.id].room,
                message: data.message,
                date_sent: new Date()
            };

            // Save to Mongo
            try {
                const newMessage = new GroupMessage(messageData);
                await newMessage.save();
            } catch (err) {
                console.log('Error saving group message:', err);
            }

            ioServer.to(users[socket.id].room).emit('group_message_client', messageData);
        }
    });

    socket.on('private_message', async (data) => {
        const messageData = {
            from_user: data.from_user,
            to_user: data.to_user,
            message: data.message,
            date_sent: new Date()
        };

        try {
            const newMessage = new PrivateMessage(messageData);
            await newMessage.save();
        } catch (err) {
            console.log('Error saving private message:', err);
        }

        
        const targetSocketId = Object.keys(users).find(
            id => users[id].username === data.to_user
        );

        if (targetSocketId) {
            ioServer.to(targetSocketId).emit('private_message_client', messageData);
        }
        
        socket.emit('private_message_client', messageData);
    });

    // Typing indicator
    socket.on('typing', (data) => {
        if (data.to_user) {
            
            const targetSocketId = Object.keys(users).find(
                id => users[id].username === data.to_user
            );
            if (targetSocketId) {
                ioServer.to(targetSocketId).emit('user_typing', {
                    username: data.username,
                    isPrivate: true
                });
            }
        } else if (users[socket.id] && users[socket.id].room) {
            
            socket.to(users[socket.id].room).emit('user_typing', {
                username: data.username,
                isPrivate: false
            });
        }
    });

    socket.on('stop_typing', (data) => {
        if (data.to_user) {
            const targetSocketId = Object.keys(users).find(
                id => users[id].username === data.to_user
            );
            if (targetSocketId) {
                ioServer.to(targetSocketId).emit('user_stop_typing', {
                    username: data.username,
                    isPrivate: true
                });
            }
        } else if (users[socket.id] && users[socket.id].room) {
            socket.to(users[socket.id].room).emit('user_stop_typing', {
                username: data.username,
                isPrivate: false
            });
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            const room = users[socket.id].room;
            const username = users[socket.id].username;

            if (room) {
                ioServer.to(room).emit('user_left', {
                    username: username,
                    room: room
                });
                const members = getRoomMembers(room);
                ioServer.to(room).emit('room_members', members);
            }

            delete users[socket.id];
            console.log(`User disconnected: ${username}`);
        }
    });
});

function getRoomMembers(room) {
    const members = [];
    for (const id in users) {
        if (users[id].room === room) {
            members.push(users[id].username);
        }
    }
    return members;
}
