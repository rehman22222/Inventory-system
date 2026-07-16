const mongoose = require('mongoose');
const Order = require('../models/Ordermodel');
const logActivity = require('../libs/logger');
const ProductModel = require('../models/Productmodel');
const { runInTransaction } = require('../libs/txn');

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const opts = (session) => (session ? { session } : {});

// Accepts the current basket shape (`Products: [...]`) and the older
// single-line shape (`Product: {...}`), so an out-of-date client still works.
const incomingLines = (body) => {
    if (Array.isArray(body.Products)) return body.Products;
    if (body.Product?.product) return [body.Product];
    return [];
};

const createOrder = async (req, res) => {
    try {
        const { user, Description, status } = req.body;

        if (!user) return res.status(400).json({ message: "User ID is required" });
        if (!Description) return res.status(400).json({ message: "Description is required" });
        if (!status) return res.status(400).json({ message: "Status is required" });

        const requested = incomingLines(req.body);
        if (requested.length === 0) {
            return res.status(400).json({ message: "Add at least one product to the order" });
        }

        // --- Pass 1: validate the whole basket before touching any stock, so a
        // bad third line can't leave the first two already deducted.
        const lines = [];

        for (const item of requested) {
            const productId = String(item?.product || "");

            if (!mongoose.isValidObjectId(productId)) {
                return res.status(400).json({ message: `Invalid product id: ${productId}` });
            }

            const productRecord = await ProductModel.findById(productId);
            if (!productRecord) return res.status(404).json({ message: "Product not found" });

            const quantity = Number(item?.quantity || 0);
            if (!Number.isFinite(quantity) || quantity <= 0) {
                return res.status(400).json({ message: `Invalid quantity for ${productRecord.name}` });
            }

            if (Number(productRecord.quantity) < quantity) {
                return res.status(400).json({
                    message: `Insufficient stock for ${productRecord.name}`,
                    product: productRecord.name,
                    available: productRecord.quantity,
                    requested: quantity
                });
            }

            // Price comes from the catalogue, never from the request body.
            lines.push({
                product: productRecord._id,
                quantity,
                price: money(productRecord.Price),
            });
        }

        const totalOrderAmount = money(
            lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
        );

        const newOrder = await runInTransaction(async (session) => {
            for (const line of lines) {
                // Guarded decrement: re-checks stock at write time, so two orders
                // racing for the last unit can't both succeed.
                const updated = await ProductModel.findOneAndUpdate(
                    { _id: line.product, quantity: { $gte: line.quantity } },
                    { $inc: { quantity: -line.quantity } },
                    { new: true, ...opts(session) }
                );

                if (!updated) {
                    throw Object.assign(
                        new Error("Stock changed while the order was being placed — please try again"),
                        { statusCode: 409 }
                    );
                }
            }

            const [created] = await Order.create([{
                user,
                Description,
                Products: lines,
                totalAmount: totalOrderAmount,
                status,
            }], opts(session));

            return created;
        });

        await newOrder.populate([
            { path: "Products.product", select: "name Price barcode" },
            { path: "user", select: "name email" },
        ]);

        await logActivity({
            action: "Create Order",
            description: `Order for ${lines.length} product(s) totalling ${totalOrderAmount} was created.`,
            entity: "order",
            entityId: newOrder._id,
            userId: req.user?._id,
            ipAddress: req.ip,
        });

        res.status(201).json({ success: true, message: "Order created successfully", order: newOrder });
    } catch (error) {
        console.error('Error creating order:', error);
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            message: status === 500 ? "Error in creating order" : error.message,
            error: error.message,
        });
    }
};



const Removeorder = async (req, res) => {
    try {
        const { OrdertId } = req.params;
        const userId = req.user._id;
        const ipAddress = req.ip;
        
        const Deletedorder = await Order.findByIdAndDelete(OrdertId);

        if (!Deletedorder) {
            return res.status(404).json({ message: "Order is not found!" });
        }

        await logActivity({
            action: "Delete order",
            description: `Order was deleted.`,
            entity: "order",
            entityId: Deletedorder._id,
            userId: userId,
            ipAddress: ipAddress,
        });

        res.status(200).json({ message: "Order deleted successfully" });

    } catch (error) {
        res.status(500).json({ message: "Error deleting Order", error: error.message });
    }
};


const getOrder = async (req, res) => {
    try {
        // "ProductModelrice" was a mangled "Price" — it selected a field that does
        // not exist, so the price never reached the client and had to be typed in
        // by hand.
        const orders = await Order.find({})
  .populate("Products.product", "name Price barcode")
  .populate("user", "name email")
  .sort({ createdAt: -1 });

        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: "Error getting orders", error: error.message });
    }
};



 
const updatestatusOrder = async (req, res) => {
    try {
        const { OrderId } = req.params;
        const updates = { ...req.body };
        const userId = req.user._id;
        const ipAddress = req.ip;

        // This endpoint moves an order along its status; it does not re-price it.
        // The basket and the total are derived from the catalogue at creation, so
        // ignore any attempt to send them back in.
        // (It used to multiply by `item.ProductModelrice`, a mangled "price",
        // which is always undefined — every recomputed total came out NaN.)
        delete updates.Products;
        delete updates.Product;
        delete updates.totalAmount;

        const updatedOrder = await Order.findByIdAndUpdate(OrderId, updates, { new: true })
            .populate("Products.product", "name Price barcode")
            .populate("user", "name email");

        if (!updatedOrder) {
            return res.status(404).json({ message: "Order not found" });
        }


        await logActivity({
            action: "Update Order",
            description: `Order updated successfully.`,
            entity: "order",
            entityId: updatedOrder._id,
            userId: userId,
            ipAddress: ipAddress,
        });

        res.status(200).json({ message: "Order successfully updated", order: updatedOrder });
    } catch (error) {
        res.status(500).json({ message: "Error updating order", error: error.message });
    }
};

const searchOrder = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({ message: "Query parameter is required" });
        }

        const searchdata = await Order.find({
            $or: [
                { Desciption: { $regex: query, $options: "i" } },
                { status: { $regex: query, $options: "i" } },
                { "user.name": { $regex: query, $options: "i" } }
            ]
        });

        res.json(searchdata);

    } catch (error) {
        res.status(500).json({ message: "Error in search Orders", error: error.message });
    }
};



const getOrderStatistics=async(req,res)=>{
try {
    const orderStats=await Order.aggregate([
        {
            $group:{
                _id:"$status",
                count:{$sum:1}
            }
        }

    ])


    res.status(200).json(orderStats)
} 

catch (error) {
    
}
}


module.exports = {
    createOrder,
    searchOrder,
    updatestatusOrder,
    getOrder,
    Removeorder,
    getOrderStatistics
};
