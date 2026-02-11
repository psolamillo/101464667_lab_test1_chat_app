const express = require('express');
const User = require('../models/User');
const app = express();

app.post('/api/signup', async (req, res) => {
    try {
        const { username, firstname, lastname, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const newUser = new User({
            username: username.toLowerCase(),
            firstname,
            lastname,
            password,
            createon: new Date()
        });

        await newUser.save();
        res.status(201).json({ message: 'User created successfully', username: newUser.username });
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: messages.join(', ') });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        if (password !== user.password) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        res.status(200).json({
            message: 'Login successful',
            username: user.username,
            firstname: user.firstname,
            lastname: user.lastname
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = app;
