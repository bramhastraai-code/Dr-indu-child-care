const mongoose = require('mongoose');
require('./src/models/Doctor');
const uri = 'mongodb+srv://rakesh:IHMUNHqx3mGNqPXX@cluster0.mnmfdg6.mongodb.net/dr_indu_child_care?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(uri)
    .then(async () => {
        const res = await mongoose.model('Doctor').updateMany({}, { $set: { is_active: true } });
        console.log('Updated doctors:', res.modifiedCount);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
