require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt')
const nodemailer = require("nodemailer");
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000; 
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((err) => {
        console.error('Error connecting to MongoDB:', err.message);
    });

// Define user schema
const userSchema = new mongoose.Schema({
    email: String,
    username: { type: String, unique: true },
    password: String,
    firstName: String,
    lastName: String,
    age: Number,
    country: String,
    gender: String,
    role: { type: String, enum: ['regular user', 'admin'], default: 'regular user' },
    createdAt: { type: Date, default: Date.now }
});

const carSchema = new mongoose.Schema({
    username: String,
    picture1: String,
    picture2: String,
    picture3: String,
    model: String, // Changed from 'names' to 'model'
    description: String, // Changed from 'descriptions' to 'description'
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null }
});

const User = mongoose.model('User', userSchema);
const Car = mongoose.model('Car', carSchema); // Create model for car

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Set the view engine to ejs
app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/register', (req, res) => {
    res.render('register', { message: '' }); // Pass an empty message initially
});

app.post('/register', async (req, res) => {
    try {
        const existingUser = await User.findOne({ username: req.body.username });
        if (existingUser) {
            return res.render('register', { message: 'User already exists. Choose a different username.' });
        }

        const {email, username, password, firstName, lastName, age, country, gender } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, username, password: hashedPassword, firstName, lastName, age, country, gender });
        await user.save();

        // Send welcome email
        const recipient = email; // Assuming the username is also the email address
        const info = await transporter.sendMail({
            from: 'alihandosmaganbetov@gmail.com',
            to: recipient,
            subject: "Welcome to Apple Tech Hub",
            text: "Thank you for choosing us!"
        });

        res.redirect('/');
    } catch (error) {
        res.status(500).send(error.message);
    }
});


// Function to validate password
function validatePassword(password) {
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;
    return passwordRegex.test(password);
}

app.get('/login', (req, res) => {
    res.render('login', { message: '' }); // Pass an empty message initially
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.render('login', { message: 'Incorrect username or password. Please try again.' });
    }

    req.session.userId = username; // Store username instead of user._id

    if (user.role === 'admin') {
        return res.redirect('/admin');
    } else {
        return res.redirect('/dashboard');
    }
});


// Route to handle adding new cars
app.post('/admin/add-car', async (req, res) => {
    try {
        const { username, picture1, picture2, picture3, model, description } = req.body;

        const newCar = new Car({
            username,
            picture1,
            picture2,
            picture3,
            model,
            description
        });

        await newCar.save();
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Route to handle editing existing cars
app.post('/admin/edit-car', async (req, res) => {
    let { objectId, model, description } = req.body;
    try {
        objectId = objectId.trim();

        if (!mongoose.isValidObjectId(objectId)) {
            return res.status(400).send('Invalid objectId');
        }

        await Car.findByIdAndUpdate(objectId, { model, description, updatedAt: Date.now() });
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send(error.message);
    }
});



// Route to handle soft deletion of cars
app.post('/admin/delete-car/:carId', async (req, res) => {
    const { carId } = req.params;
    try {
        await Car.findByIdAndDelete(carId);
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        try {
            // Find cars where the username matches the logged-in user's username
            const cars = await Car.find({ username: req.session.userId });
            res.render('dashboard', { items: cars }); // Even though you're now using cars, keeping the variable as 'items' might be okay for your template, but consider renaming for clarity.
        } catch (error) {
            res.status(500).send(error.message);
        }
    }
});


app.get('/location', (req, res) => {
    res.render('location', { message: '' }); // Pass an empty message initially
});

app.get('/cars', async (req, res) => {
    const models = ['Dodge Challenger Hellcat', 'Dodge Challenger Demon', 'Ford Mustang Shelby'];
    // Assuming getCarInfo is a function that fetches car information, similar to getDeviceInfo
    const carsInfo = await Promise.all(models.map(model => getCarInfo(model)));

    // Filter out null values in case of errors
    const validCars = carsInfo.filter(car => car !== null);

    res.render('cars', { cars: validCars }); // Changed from 'iphones' to 'cars', and 'devices' to 'cars'
});


app.get('/exchange-rates', async (req, res) => {
    try {
        const response = await axios.get('https://openexchangerates.org/api/latest.json?app_id=7c863ad618954be0bd0e580284078fed');
        res.render('exchange-rates', { rates: response.data.rates });
    } catch (error) {
        console.error(error);
        res.send('An error occurred');
    }
});





app.get('/admin', async (req, res) => {
    try {
        const cars = await Car.find(); // Changed from Item to Car
        res.render('admin', { items: cars, message: '' }); // Note: You may want to change the variable name from `items` to `cars` in your EJS file for clarity.
    } catch (error) {
        res.status(500).send(error.message);
    }
});



app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});














































































// This is an example code snippet showing how data could be organized and passed to EJS for cars instead of devices.
app.get('/car-info', async (req, res) => {
    const carsInfo = [
        {
            ModelName: 'Dodge Challenger Hellcat',
            Brand: 'Dodge',
            Engine: '6.2L Supercharged HEMI V8',
            Horsepower: '717 hp',
            Torque: '656 lb-ft'
        },
        {
            ModelName: 'Dodge Challenger Demon',
            Brand: 'Dodge',
            Engine: '6.2L Supercharged HEMI V8',
            Horsepower: '808 hp',
            Torque: '717 lb-ft'
        },
        {
            ModelName: 'Ford Mustang Shelby GT500',
            Brand: 'Ford',
            Engine: '5.2L Supercharged V8',
            Horsepower: '760 hp',
            Torque: '625 lb-ft'
        }
    ];
    res.render('car-info', { cars: carsInfo }); // Updated to reflect the context of cars
});
