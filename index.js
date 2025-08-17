const express = require('express')
const cors = require('cors');
const app = express()
const jwt = require('jsonwebtoken')
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_SECRET);


app.use(cors({
    origin: ['http://localhost:5173',
        'https://assignment-12-52342.web.app'
    ],
    credentials: true,

}));
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qam3y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {



        const usersCollection = client.db('assignment12').collection('users')
        const productCollection = client.db('assignment12').collection('product')
        const storeCollection = client.db('assignment12').collection('productAdd')
        const paymentIntents = client.db('assignment12').collection('payments')
        const WatchlistCollection = client.db('assignment12').collection('watchlist')
        const offersCollection = client.db('assignment12').collection('offers')
        const reviewsCollection = client.db('assignment12').collection('reviews')


        const verifyJWT = (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'Unauthorized access: No token' });
            }
            const token = authHeader.split(' ')[1]; // Bearer <token>

            jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: 'Forbidden access: Invalid token' });
                }

                req.user = decoded;
                next();
            });
        };
        const verifyAdmin = async (req, res, next) => {
            const email = req.user.email;
            const user = await usersCollection.findOne({ email });

            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden: Admins only' });
            }

            next();
        };
        const verifyVendor = async (req, res, next) => {
            const email = req.user.email;
            const user = await usersCollection.findOne({ email });

            if (!user || user.role !== 'vendor') {
                return res.status(403).send({ message: 'Forbidden: Vendors only' });
            }

            next();
        };




        // jwt
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });


        // user

        app.get('/users', verifyJWT, async (req, res) => {
            try {
                const result = await usersCollection.find().toArray();
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'Failed to get users' });
            }
        });

        app.get('/users/role/:email', verifyJWT, async (req, res) => {
            try {
                const user = await usersCollection.findOne({ email: req.params.email });
                res.send({ role: user?.role || 'user' });
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'Failed to fetch role' });
            }
        });

        app.post('/users', async (req, res) => {
            const email = req.body.email;

            try {
                // Check if user already exists
                const userExists = await usersCollection.findOne({ email });

                if (userExists) {
                    return res.status(200).send({
                        message: 'User already exists',
                        inserted: false
                    });
                }

                // Insert new user (default role = 'user')
                const user = {
                    ...req.body,
                    role: req.body.role || 'user',
                    createdAt: new Date()
                };

                const result = await usersCollection.insertOne(user);

                res.status(201).send({
                    message: 'User inserted successfully',
                    inserted: true,
                    result
                });

            } catch (error) {
                console.error('Error inserting user:', error);
                res.status(500).send({
                    message: 'Internal server error',
                    error: error.message
                });
            }
        });

        app.put('/users', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { name, email, imageUrl, role = 'user' } = req.body;

                if (!email) return res.status(400).json({ message: 'Email is required' });

                const userDoc = {
                    $setOnInsert: { createdAt: new Date() }, // only during insert
                    $set: { name, email, imageUrl, role }
                };

                const result = await usersCollection.updateOne(
                    { email },
                    userDoc,
                    { upsert: true }
                );

                res.status(200).json({ message: 'User stored/updated successfully', result });

            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'Server Error' });
            }
        });

        app.patch('/users/role/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const { role } = req.body;

            if (!['admin', 'vendor', 'user'].includes(role)) {
                return res.status(400).json({ message: 'Invalid role type' });
            }

            try {
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { role } }
                );

                res.send({
                    message: `Role updated to ${role}`,
                    result
                });

            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'Failed to update role' });
            }
        });
        // DELETE: Delete user by email
        app.delete('/users/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            try {
                const result = await usersCollection.deleteOne({ email });

                if (result.deletedCount > 0) {
                    res.status(200).send({
                        success: true,
                        message: 'User deleted successfully',
                        deletedCount: result.deletedCount
                    });
                } else {
                    res.status(404).send({
                        success: false,
                        message: 'User not found'
                    });
                }
            } catch (error) {
                console.error('Error deleting user:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal server error',
                    error: error.message
                });
            }
        });

        // product

        app.post("/product", async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne(product);
            res.status(201).json({ success: true, data: result });
        });
        // ✅ All product route (no filter) for admin
        app.get("/product/all", verifyJWT, async (req, res) => {
            const products = await productCollection.find().sort({ date: -1 }).toArray();
            res.send(products);
        });

        app.get("/product", async (req, res) => {
            try {
                const { sort, startDate, endDate } = req.query;

                // ✅ Filter only approved products
                const filter = { status: "approved" };

                // ✅ Date filtering (if provided)
                if (startDate && endDate) {
                    filter.date = { $gte: startDate, $lte: endDate };
                }

                // ✅ Sorting by first item's price
                let sortOption = {};
                if (sort === "price_asc") {
                    sortOption["items.0.price"] = 1;
                } else if (sort === "price_desc") {
                    sortOption["items.0.price"] = -1;
                }

                const products = await productCollection
                    .find(filter)
                    .sort(sortOption)
                    .toArray();

                res.send(products);
            } catch (err) {
                console.error("Error fetching products:", err);
                res.status(500).send({ message: "Internal server error" });
            }
        });


        app.get("/product/vendor/:email", async (req, res) => {
            const products = await productCollection.find({ vendorEmail: req.params.email }).toArray();
            res.json(products);
        });
        app.get('/products/:id', async (req, res) => {
            const result = await productCollection.findOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });
        app.delete('/product/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await productCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send({ deletedCount: result.deletedCount });
        });
        // GET /orders/:email
        app.get('/orders/:email', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const orders = await productCollection.find({ userEmail: req.params.email }).sort({ date: -1 }).toArray();
                res.json(orders);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch orders' });
            }
        });

        // Approve
        app.patch('/product/:id/approve', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await productCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: "approved" } }
            );
            res.send(result);
        });

        // Reject with reason
        app.patch('/product/:id/reject', verifyJWT, verifyAdmin, async (req, res) => {
            const reason = req.body.reason;
            const result = await productCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: "rejected", rejectionReason: reason } }
            );
            res.send(result);
        });

        app.patch('/product/:id/updatePrice', verifyJWT, verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const { itemIndex, newPrice } = req.body;

            const product = await productCollection.findOne({ _id: new ObjectId(id) });
            if (!product) return res.status(404).send({ error: 'Not found' });

            product.items[itemIndex].price = parseFloat(newPrice);
            await productCollection.updateOne({ _id: new ObjectId(id) }, { $set: { items: product.items } });

            res.send({ success: true });
        });

        // store
        app.get('/productAdd', verifyJWT, async (req, res) => {
            const result = await storeCollection.find().toArray()
            res.send(result)
        });
        app.get("/productAdd/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;

            // Validate ObjectId format
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ error: "Invalid ID format" });
            }

            try {
                const product = await storeCollection.findOne({ _id: new ObjectId(id) });

                if (!product) {
                    return res.status(404).send({ error: "Product not found" });
                }

                res.send(product);
            } catch (err) {
                console.error("❌ Error fetching product:", err);
                res.status(500).send({ error: "Server error" });
            }
        });

        app.get('/productAdd/email/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            console.log(email, 'email')
            try {
                const result = await storeCollection.find({
                    email: { $regex: new RegExp(`^${email}$`, "i") }
                }).toArray();
                res.send(result);
            } catch (err) {
                console.error("❌ Error in fetching:", err);
                res.status(500).send({ error: "Server error" });
            }
        });
        app.post('/productAdd', verifyJWT, async (req, res) => {
            try {
                const data = req.body;
                const result = await storeCollection.insertOne(data);

                if (result.insertedId) {
                    res.send({ success: true, message: "Inserted successfully!" });
                } else {
                    res.send({ success: false, message: "Insertion failed." });
                }
            } catch (err) {
                console.error(err);
                res.status(500).send({ success: false, message: "Server error" });
            }
        });
        app.delete('/productAdd/:id', verifyJWT,verifyVendor, async (req, res) => {
            const id = req.params.id;
            try {
                const result = await storeCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            } catch (error) {
                console.error("Error deleting product:", error);
                res.status(500).send({ error: "Delete failed" });
            }
        });
        // Payment API
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const amountInCents = req.body.amountInCents
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents, // Amount in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
                });
                res.json({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // pyment
        app.get('/payments', verifyJWT, async (req, res) => {
            try {
                const { email } = req.query;
                const history = await paymentIntents
                    .find({ email })
                    .sort({ payment_date: -1 }) // 🔽 latest first
                    .toArray();

                res.send(history);
            } catch (error) {
                console.error('GET /payments/history error:', error);
                res.status(500).json({ success: false, message: 'Server error' });
            }
        });


        app.post('/payments', verifyJWT, async (req, res) => {
            try {
                const {
                    newId,
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                } = req.body;

                // 1. Insert payment history to `paymentCollection`
                const paymentDoc = {
                    newId: new ObjectId(newId),
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                    paid_at_string: new Date().toISOString(),
                    payment_date: new Date(),
                };

                const paymentResult = await paymentIntents.insertOne(paymentDoc);

                // 2. Update the parcel in `storeCollection` to mark it as paid
                const updateResult = await storeCollection.updateOne(
                    { _id: new ObjectId(newId) },
                    { $set: { payment_status: 'paid' } }
                );

                res.send({
                    success: true,
                    message: 'Payment recorded and parcel marked as paid',
                    paymentId: paymentResult.insertedId,
                    updated: updateResult.modifiedCount > 0,
                });
            } catch (error) {
                console.error('Error in POST /payments:', error);
                res.status(500).send({ success: false, message: 'Server error' });
            }
        });

        // offers
        app.get('/offers', verifyJWT, async (req, res) => {
            try {
                const result = await offersCollection.find().toArray();
                res.send(result);
            } catch (err) {
                console.error('GET /offers error', err);
                res.status(500).send({ success: false, message: 'Server error' });
            }
        });

        // GET one offer
        app.get('/offers/:id', verifyJWT, async (req, res) => {
            try {
                const { id } = req.params;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: 'Invalid offer ID' });
                }
                const offer = await offersCollection.findOne({ _id: new ObjectId(id) });
                if (!offer) {
                    return res.status(404).send({ success: false, message: 'Offer not found' });
                }
                res.send(offer);
            } catch (err) {
                console.error('GET /offers/:id error', err);
                res.status(500).send({ success: false, message: 'Server error' });
            }
        });

        // POST create offer (vendor)
        app.post('/offers', verifyJWT, async (req, res) => {
            try {
                const data = req.body;
                // default status pending
                if (!data.status) data.status = 'pending';
                const result = await offersCollection.insertOne(data);
                if (result.insertedId) {
                    return res.send({ success: true, message: 'Inserted successfully!', insertedId: result.insertedId });
                }
                res.send({ success: false, message: 'Insertion failed.' });
            } catch (err) {
                console.error('POST /offers error', err);
                res.status(500).send({ success: false, message: 'Server error' });
            }
        });

        // DELETE offer (admin)
        app.delete('/offers/:id', verifyJWT, async (req, res) => {
            try {
                const { id } = req.params;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: 'Invalid offer ID' });
                }
                const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });
                res.send({ success: true, deletedCount: result.deletedCount });
            } catch (err) {
                console.error('DELETE /offers/:id error', err);
                res.status(500).send({ success: false, message: 'Server Error' });
            }
        });

        // PATCH approve offer (admin)
        app.patch('/offers/approve/:id', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: 'Invalid offer ID' });
                }
                const result = await offersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: { status: 'approved' },
                        $unset: { rejectionReason: '' }, // remove reason if previously rejected
                    }
                );
                res.send({ success: result.modifiedCount > 0, modifiedCount: result.modifiedCount });
            } catch (err) {
                console.error('PATCH /offers/approve/:id error', err);
                res.status(500).send({ success: false, message: 'Server Error' });
            }
        });

        // PATCH reject offer (admin)
        app.patch('/offers/reject/:id', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { reason } = req.body || {};
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: 'Invalid offer ID' });
                }
                if (!reason || !reason.trim()) {
                    return res.status(400).send({ success: false, message: 'Rejection reason is required' });
                }
                const result = await offersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: { status: 'rejected', rejectionReason: reason.trim() },
                    }
                );
                res.send({ success: result.modifiedCount > 0, modifiedCount: result.modifiedCount });
            } catch (err) {
                console.error('PATCH /offers/reject/:id error', err);
                res.status(500).send({ success: false, message: 'Failed to reject offer' });
            }
        });
    


    // GET /watchlist?email

    app.get('/watchlist', verifyJWT, async (req, res) => {
        try {
            const email = req.query.email;
            if (!email) return res.status(400).json({ error: 'Email is required' });

            const items = await WatchlistCollection.find({ userEmail: email }).toArray();
            res.json(items);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch watchlist' });
        }
    });

    // POST  watchlist
    app.post('/watchlist', verifyJWT, async (req, res) => {
        try {
            const data = req.body;
            const result = await WatchlistCollection.insertOne(data);
            res.send({ success: !!result.insertedId });
        } catch (err) {
            console.error("❌ Watchlist Error:", err);
            res.status(500).send({ success: false, message: "Server error" });
        }
    });
    app.delete('/watchlist/:id', verifyJWT, async (req, res) => {
        const id = req.params.id;
        const result = await WatchlistCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
    });

    // GET reviews for a market/product
    app.get('/reviews', verifyJWT, async (req, res) => {
        try {
            const marketId = req.query.marketId;
            if (!marketId) return res.status(400).json({ error: 'marketId is required' });

            const reviews = await reviewsCollection
                .find({ marketId: new ObjectId(marketId) })
                .sort({ date: -1 })
                .toArray();

            res.json(reviews);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch reviews' });
        }
    });
    //  GET reviews by productId
    app.get('/reviews/:productId', verifyJWT, async (req, res) => {
        const { productId } = req.params;
        try {
            const reviews = await reviewsCollection.find({ productId }).toArray();
            res.send(reviews);
        } catch (err) {
            console.error(err);
            res.status(500).send({ message: 'Error fetching reviews' });
        }
    });



    // POST 
    app.get('/reviews', verifyJWT, async (req, res) => {
        const result = await reviewsCollection.find().toArray();
        res.send(result)
    })

    app.post('/reviews', verifyJWT, async (req, res) => {
        try {
            const data = req.body;
            const result = await reviewsCollection.insertOne(data);
            res.send({ success: !!result.insertedId });
        } catch (err) {
            console.error("❌ Review Error:", err);
            res.status(500).send({ success: false, message: "Server error" });
        }
    });

    app.patch("/reviews/:id", verifyJWT, async (req, res) => {
        const id = req.params.id;
        const updatedReview = req.body;

        try {
            const result = await reviewsCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        review: updatedReview.review,
                        rating: updatedReview.rating,
                        date: new Date().toISOString(),
                    },
                }
            );

            if (result.modifiedCount > 0) {
                res.send({ success: true, message: "Review updated successfully" });
            } else {
                res.send({ success: false, message: "No changes made" });
            }
        } catch (err) {
            console.error("Error updating review:", err);
            res.status(500).send({ success: false, message: "Update failed" });
        }
    });
    app.delete('/reviews/:id', verifyJWT, async (req, res) => {
        try {
            const { id } = req.params;

            const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
            res.json({ success: result.deletedCount > 0 });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Delete failed' });
        }
    });




    app.get('/estimateCount', async (req, res) => {
        try {
            const { email } = req.query;
            if (!email) return res.status(400).send({ error: "Email is required" });

            // Count total products (all store products)
            const productsCount = await productCollection.estimatedDocumentCount();

            // User's orders
            const orders = await productCollection.find({ email }).toArray();

            // User's payments
            const payments = await paymentIntents.find({ email }).toArray();

            // User's watchlist items
            const watchlist = await WatchlistCollection.find({ email }).toArray();

            // Calculate total price of payments
            const totalPrice = payments.reduce((sum, p) => sum + (p.price || 0), 0);

            res.send({
                email,
                products: productsCount,
                orders: orders.length,
                payments: payments.length,
                totalPrice,
                watchlist: watchlist.length,
            });
        } catch (error) {
            console.error("Estimate Count Error:", error);
            res.status(500).send({ error: "Something went wrong" });
        }
    });

    app.get('/product', verifyJWT, async (req, res) => {
        try {

            const products = await productCollection.find({}).sort({ date: -1 }).toArray();
            res.json(products);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch products" });
        }
    });

    // Get user's
    app.get('/watchlist', verifyJWT, async (req, res) => {
        try {
            const { email } = req.query;
            if (!email) return res.status(400).send({ error: "Email is required" });

            const watchlist = await WatchlistCollection.find({ email }).toArray();
            res.json(watchlist);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch watchlist" });
        }
    });

    // Get user's orders 
    app.get('/orders/:email', verifyJWT, async (req, res) => {
        try {
            const email = req.params.email;
            if (!email) return res.status(400).send({ error: "Email is required" });

            const orders = await productCollection.find({ email }).sort({ date: -1 }).toArray();
            res.json(orders);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch orders" });
        }
    });





    console.log("Pinged your deployment. You successfully connected to MongoDB!");
} finally {

}
}
run().catch(console.dir);






app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
