const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.port || 3000;

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
    app.get("/mylistdata", async (req, res) => {
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
        category: { $regex: search_text, $options: "i" },
      }).toArray();
      res.send(result);
    });

    // Order then data
    app.post("/orders", async (req, res) => {
      const data = req.body;
      const result = await OrderCollections.insertOne(data);
      res.send(result);
    });
    app.get("/orders", async (req, res) => {
      const cursor = await OrderCollections.find().toArray();
      res.send(cursor);
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
