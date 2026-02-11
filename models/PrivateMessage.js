const mongoose = require('mongoose');

const PrivateMessageSchema = new mongoose.Schema({
    from_user: {
        type: String,
        required: [true, 'Sender username is required']
    },
    to_user: {
        type: String,
        required: [true, 'Recipient username is required']
    },
    message: {
        type: String,
        required: [true, 'Message is required']
    },
    date_sent: {
        type: Date,
        default: Date.now
    }
});

const PrivateMessage = mongoose.model('PrivateMessage', PrivateMessageSchema);
module.exports = PrivateMessage;
