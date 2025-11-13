const express = require("express");
const app = express();
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.port || 3000;

// access token

const serviceAccount = require("./PetBond-Secret-Token.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const logger = (req, res, next) => {
  console.log("Logging information!");
  next();
};

const verifyFirebaseToken = async (req, res, next) => {
  console.log("in the verify MidleWare", req.headers.authorization);
  //
  if (!req.headers.authorization) {
    // do not allow to go
    return res.status(401).send({ messege: "Unauthorized Access!" });
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ messege: "unauthorized Access!" });
  }

  try {
    const UserInfo = await admin.auth().verifyIdToken(token);
    // hacker authorized
    req.token_email = UserInfo.email;
    console.log("After Token Validation", UserInfo);
    next();
  } catch {
    return res.status(401).send({ messege: "unauthorized Access!" });
  }
};

// middleWare
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.PET_USER}:${process.env.PET_PASS}@cluster1.ofkx5hm.mongodb.net/?appName=Cluster1`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("PawMart Project !!");
});

async function run() {
  try {
    await client.connect();
    const db = client.db("PetMart");
    const PetMartListingCollections = db.collection("petmartlist");
    const OrderCollections = db.collection("Order");

    app.post("/petListdata", async (req, res) => {
      const data = req.body;
      const result = await PetMartListingCollections.insertOne(data);
      res.send(result);
    });

    app.get("/petListdata", async (req, res) => {
      const cursor = await PetMartListingCollections.find().sort({ date: 1 });
      // .limit(6)
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/petListdata/details/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: new ObjectId(id) };
      // console.log(query);
      const result = await PetMartListingCollections.find(query).toArray();
      res.send(result);
    });
    // my Listed Data
    app.get("/mylistdata", logger, verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const quiry = {};
      if (email) {
        quiry.email = email;
      }
      const cursor = PetMartListingCollections.find(quiry);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/mylistdata/:id", async (req, res) => {
      const id = req.params.id;
      const quiry = { _id: new ObjectId(id) };
      const result = await PetMartListingCollections.deleteOne(quiry);
      console.log(result);
      res.send(result);
    });

    // update my list data
    app.patch("/mylistdata/:id", async (req, res) => {
      const id = req.params.id;
      const updateUser = req.body;
      const quiry = { _id: new ObjectId(id) };
      const Update = {
        $set: {
          name: updateUser.name,
          category: updateUser.category,
          price: updateUser.price,
          location: updateUser.location,
          description: updateUser.description,
          image: updateUser.image,
          email: updateUser.email,
          date: updateUser.date,
        },
      };
      const options = {};
      const result = await PetMartListingCollections.updateOne(
        quiry,
        Update,
        options
      );
      res.send(result);
    });

    // search
    app.get("/search", async (req, res) => {
      const search_text = req.query.search;
      const result = await PetMartListingCollections.find({
        name: { $regex: search_text, $options: "i" },
      }).toArray();
      res.send(result);
    });

    // Order then data
    app.post("/orders", async (req, res) => {
      const data = req.body;
      const result = await OrderCollections.insertOne(data);
      res.send(result);
    });
    app.get("/orders", logger,verifyFirebaseToken, async (req, res) => {
      const cursor = await OrderCollections.find().toArray();
      res.send(cursor);
    });
    app.get("/myorders", logger, verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const quiry = {};
      if (email) {
        if (email !== req.token_email) {
          return res.status(403).send({ messeger: "Forbidden Access" });
        }
        quiry.email = email;
      }
      const result = await OrderCollections.find(quiry)
        .sort({ date: 1 })
        .toArray();
      res.send(result);
    });

    app.delete("/myorders/:id", async (req, res) => {
      const id = req.params.id;
      const quiry = { _id: new ObjectId(id) };
      const result = await OrderCollections.deleteOne(quiry);
      // console.log(result);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
