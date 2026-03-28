const express = require("express");
const app = express();
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.port || 3000;
// payment gatway
app.use(express.json());
app.use(cors());
app.use(express.static("public"));
const stripe = require("stripe")(`${process.env.DB_PAY}`);

function generateTrackingId() {
  const prefix = "BLDFUND";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
}
// access token

const serviceAccount = require("./PetBond-Secret-Token.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const logger = (req, res, next) => {
  // console.log("Logging information!");
  next();
};

const verifyFirebaseToken = async (req, res, next) => {
  // console.log("in the verify MidleWare", req.headers.authorization);
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
    // console.log("After Token Validation", UserInfo);
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
    // await client.connect();
    const db = client.db("PetMart");
    const PetMartListingCollections = db.collection("petmartlist");
    const OrderCollections = db.collection("Order");
    const paymentCollections = db.collection("payments");
    const userCollection = db.collection("users");
    const feedbackCollections = db.collection("feedbacks");
    // userlist
    app.post("/users", async (req, res) => {
      const data = req.body;
      data.role = "user";
      data.createdAt = new Date().toISOString();
      const email = data.email;
      const userExist = await userCollection.findOne({ email });
      if (userExist) {
        return res.send({ messege: "user already exist" });
      }
      const result = await userCollection.insertOne(data);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const email = req.query.email;
      const quiry = {};
      if (email) {
        quiry.email = email;
      }
      const result = await userCollection
        .find(quiry)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const quiry = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(quiry);

      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const updateUser = req.body;
      const quiry = { _id: new ObjectId(id) };
      const Update = {
        $set: {
          role: updateUser.role,
        },
      };
      const options = {};
      const result = await userCollection.updateOne(quiry, Update, options);
      res.send(result);
    });
    // pet list
    app.post("/petListdata", async (req, res) => {
      const data = req.body;
      data.createdAt = new Date().toISOString();
      const result = await PetMartListingCollections.insertOne(data);
      res.send(result);
    });

    app.get("/petListdata", async (req, res) => {
      try {
        const { limit, skip, category = null, search = "" } = req.query;

        let query = {};
        if (category) {
          query.category = category;
        }

        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        const cursor = PetMartListingCollections.find(query)
          .project({ description: 0 })
          .skip(Number(skip) || 0)
          .limit(Number(limit) || 10);

        const result = await cursor.toArray();
        const count = await PetMartListingCollections.countDocuments(query);

        res.send({ data: result, total: count });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server Error" });
      }
    });
    app.get("/homepetListdata", async (req, res) => {
      const cursor = await PetMartListingCollections.find()
        .sort({ createdAt: -1 })

        .project({
          description: 0,
        });

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

    // Payment Gateway - Create Session
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = Math.round(parseFloat(paymentInfo.price) * 100);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.productName,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.customer_email,
          mode: "payment",
          metadata: {
            orderId: paymentInfo.id,
            productName: paymentInfo.productName,
            productId: paymentInfo.productId,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(500).send({ error: error.message });
      }
    });

    // Payment Success Handle
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;

      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const orderId = session.metadata?.orderId;

        if (!orderId) {
          return res.status(400).send({
            success: false,
            message: "Order ID not found in metadata",
          });
        }

        const transactionId = session.payment_intent;
        const newTrackingId = `TRK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        const query = { _id: new ObjectId(orderId) };
        const updateDoc = {
          $set: {
            paymentStatus: "paid",
            deliveryStatus: "pending",
            trackingId: newTrackingId,
            transactionId: transactionId,
          },
        };
        const orderUpdateResult = await OrderCollections.updateOne(
          query,
          updateDoc,
        );
        const paymentExist = await paymentCollections.findOne({
          transactionId,
        });
        if (!paymentExist) {
          const payment = {
            amount: session.amount_total / 100,
            transactionId,
            trackingId: newTrackingId,
            orderId: orderId,
            paidAt: new Date(),
          };
          await paymentCollections.insertOne(payment);
        }

        res.send({
          success: true,
          transactionId,
          trackingId: newTrackingId,
          orderUpdateResult,
        });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const quiry = {};
      if (email) {
        quiry.customer_email = email;
      }
      const result = await paymentCollections
        .find(quiry)
        .sort({ paidAt: -1 })
        .toArray();
      res.send(result);
    });
    // total Amount
    app.get("/allAmount", async (req, res) => {
      const pipeline = [
        {
          $match: {
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
          },
        },
      ];

      const result = await paymentCollections.aggregate(pipeline).toArray();

      res.send(result);
    });

    app.get("/OrderPending", async (req, res) => {
      const pipeline = [
        {
          $match: {
            paymentStatus: "pending",
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
          },
        },
      ];

      const result = await OrderCollections.aggregate(pipeline).toArray();

      res.send(result);
    });
    app.get("/allPaidOrder", async (req, res) => {
      const pipeline = [
        {
          $match: {
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
          },
        },
      ];

      const result = await paymentCollections.aggregate(pipeline).toArray();

      res.send(result);
    });

    // all list
    app.get("/allListData", async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
          },
        },
      ];

      const result =
        await PetMartListingCollections.aggregate(pipeline).toArray();

      res.send(result);
    });

    // all order collection
    app.get("/allOrderCollections", async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
          },
        },
      ];

      const result = await OrderCollections.aggregate(pipeline).toArray();

      res.send(result);
    });

    // my Listed Data
    app.get("/mylistdata", logger, verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const quiry = {};
      if (email) {
        quiry.email = email;
      }
      const cursor = PetMartListingCollections.find(quiry).sort({
        createdAt: 1,
      });
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
        options,
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
      data.paymentStatus = "pending";
      data.orderAt = new Date().toISOString();
      const result = await OrderCollections.insertOne(data);
      res.send(result);
    });
    app.get("/orders", async (req, res) => {
      const cursor = await OrderCollections.find().toArray();
      res.send(cursor);
    });
    app.get("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await OrderCollections.find(query).toArray();
      res.send(result);
    });
    app.patch("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const update = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedoc = {
        $set: {
          deliveryStatus: update.deliveryStatus,
        },
      };
      const result = await OrderCollections.updateOne(query, updatedoc);
      res.send(result);
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
        .sort({ orderAt: 1 })
        .toArray();
      res.send(result);
    });

    app.patch("/myorders/:id", async (req, res) => {
      const id = req.params.id;
      const update = req.body;
      const query = { _id: new ObjectId(id) };

      const updatedoc = {
        $set: {
          deliveryStatus: update.deliveryStatus,
          paymentStatus: update.paymentStatus,
        },
      };
      const result = await OrderCollections.updateOne(query, updatedoc);
      res.send(result);
    });
    app.delete("/myorders/:id", async (req, res) => {
      const id = req.params.id;
      const quiry = { _id: new ObjectId(id) };
      const result = await OrderCollections.deleteOne(quiry);
      // console.log(result);
      res.send(result);
    });

    app.post("/feedbacks", async (req, res) => {
      const data = req.body;
      const result = await feedbackCollections.insertOne(data);
      res.send(result);
    });

    app.get("/feedbacks", async (req, res) => {
      const result = await feedbackCollections.find().toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
