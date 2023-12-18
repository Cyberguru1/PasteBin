#!/bin/bash node

//************************************|
// Systems Design Practice            |
// Implementation of paste bin        |
//       @cyb3rguru                   |
//************************************|

const { nanoid } = require("nanoid");
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const yup = require('yup');
const monk = require('monk');
const app = express();
const genHash = require("./utils")

app.use(helmet());
app.use(morgan('tiny'));
app.use(cors());
app.use(express.json());

// reading env variables
require('dotenv').config();

// setting up db
const db = monk(process.env.MONGO_URI);
const pastes = db.get('pastes');

const clientP = mongoose.connect(
  process.env.MONGO_URI,
  // { useNewUrlParser: true, useUnifiedTopology: true }
).then(m => m.connection.getClient())

pastes.createIndex({ slug: 1 }, { unique: true });

app.use(session(
  {
    secret: process.env.SECRET,
    resave: false,
    store:MongoStore.create({
      clientPromise: clientP,
      dbName: "session_store",
      stringify: false,
    }),
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000, sameSite: "none", httpOnly: false }
  }))

const corsOptions = {
  origin: 'http://localhost:3001',
  credentials: true,
};

app.use(cors(corsOptions));

app.use((error, req, res, next) => {
  if (error.status) {
    res.status(error.status);
  } else {
    res.status(500);
  }
  res.json({
    message: error.message,
    status: "error",
    stack: process.env.NODE_ENV === 'production' ? "err" : error.stack,
  })
})

// schema handler
const schema = yup.object().shape({
  slug: yup.string().trim().matches(/[a-zA-Z0-9_-]/i),
  paste: yup.string().trim().required(),
})

app.get('/getPaste/:id', async (req, res) => {
  const slug = req.params.id;
  try {
    const output = await pastes.findOne({ slug });
    if (output) {
      res.json({
        status:"success",
      ...output,
    });
      return;
    } else {
      res.json({
        message: `Link with id ${slug} expired`,
      });
      return;
    }
  } catch (error) {
    res.json({
      status: 'error',
      message: `Link with slug ${slug} expired`,
    });
    return;
  }
})

app.get('/', async (req, res) => {
  // get the current identity
  iden = req.session.Identifier;

  try {
    const pastesJson = await pastes.find({ iden });
    if (iden) {
      res.json({
        status: "success",
        "pastes": pastesJson
      });
      return;
    } else {
      res.json({
        stauts: "error",
        message: `Create new`,
      });
      return;
    }
  } catch (error) {
    res.json({
      status: "error",
      message: `Create new`,
    });
    return;
  }
})

app.post('/createPaste', async (req, res, next) => {

  let { slug, paste} = req.body;
  var iden = "";

  if (req.session.Identifier) {
    iden = req.session.Identifier;
  } else {
    iden = genHash(8);
    req.session.Identifier = iden;
  }
  try {
    await schema.validate({
      slug,
      paste,
    });
    slug = nanoid(9).toLowerCase();
    var createdAt = new Date()
    const newPaste = {
      paste,
      slug,
      createdAt,
      iden,
    };
    const created = await pastes.insert(newPaste);
    res.json(newPaste);
  } catch (error) {
    next(error);
  }
});



const port = process.env.PORT || 8081
const duration = process.env.DAYS || 7

// Set the time threshold in milliseconds
const timeThreshold = duration * 24 * 60 * 60 * 1000;

// Function to delete documents older than the time threshold
const deleteExpiredPastes = async () => {
  try {
    const currentTime = new Date();
    const thresholdTime = new Date(currentTime - timeThreshold);

    // Find and delete documents older than the threshold time
    const result = await pastes.remove({
      createdAt: { $lt: thresholdTime }
    });
    console.log(`${result.deletedCount} documents deleted.`);
  } catch (err) {
    console.error('Error deleting old documents:', err);
  }
};

// Worker process to delete link every 12 hours
const intervalInMilliseconds = (duration / 2) * 24 * 60 * 60 * 1000; // 1/2 week in milliseconds
setInterval(deleteExpiredPastes, intervalInMilliseconds);



app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

