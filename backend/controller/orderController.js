const mongoose = require('mongoose');
const Order = require('../models/Ordermodel');
const logActivity = require('../libs/logger');
const ProductModel = require('../models/Productmodel');
const Supplier = require('../models/Suppliermodel');
const Store = require('../models/Storemodel');
const { isMailConfigured, sendMail, brandedHtml, esc } = require('../libs/mailer');

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

// Accepts the current basket shape (`Products: [...]`) and the older
// single-line shape (`Product: {...}`), so an out-of-date client still works.
const incomingLines = (body) => {
    if (Array.isArray(body.Products)) return body.Products;
    if (body.Product?.product) return [body.Product];
    return [];
};

// A purchase order placed WITH a supplier: pick the supplier, say how many of
// each product you want, and it emails them the order. This buys stock IN — it
// does NOT reduce your inventory (that only happens when the goods arrive, via a
// Stock-in transaction).
const createOrder = async (req, res) => {
    try {
        const { user, Description = "", status = "pending", supplier } = req.body;

        if (!user) return res.status(400).json({ message: "User ID is required" });

        if (!mongoose.isValidObjectId(String(supplier || ""))) {
            return res.status(400).json({ message: "Choose a supplier for this order" });
        }
        const supplierRecord = await Supplier.findById(supplier);
        if (!supplierRecord) return res.status(404).json({ message: "Supplier not found" });
        const supplierEmail = supplierRecord.contactInfo?.email || "";

        const requested = incomingLines(req.body);
        if (requested.length === 0) {
            return res.status(400).json({ message: "Add at least one product to the order" });
        }

        // Validate the whole basket first. No stock check — you can order any
        // quantity from a supplier regardless of what you currently hold.
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

            // The unit cost we pay the supplier (falls back to the shelf price if
            // no cost is recorded). Never taken from the request body.
            const unitCost = money(productRecord.costPrice || productRecord.Price);
            lines.push({ product: productRecord._id, name: productRecord.name, quantity, price: unitCost });
        }

        const totalOrderAmount = money(
            lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
        );

        const newOrder = await Order.create({
            user,
            supplier: supplierRecord._id,
            supplierName: supplierRecord.name,
            supplierEmail,
            Description,
            Products: lines.map(({ product, quantity, price }) => ({ product, quantity, price })),
            totalAmount: totalOrderAmount,
            status,
        });

        // NOTE: the order is created but NOT emailed here. Sending to the
        // supplier is a deliberate, separate step (`sendOrder`) so nothing goes
        // out to a supplier without an explicit "send" — the person reviews the
        // order first and then confirms.
        await newOrder.populate([
            { path: "Products.product", select: "name Price barcode" },
            { path: "user", select: "name email" },
        ]);

        await logActivity({
            action: "Create Order",
            description: `Purchase order drafted for ${supplierRecord.name} — ${lines.length} product(s), total ${totalOrderAmount}.`,
            entity: "order",
            entityId: newOrder._id,
            userId: req.user?._id,
            ipAddress: req.ip,
        });

        res.status(201).json({
            success: true,
            message: "Order created — review it, then send it to the supplier",
            order: newOrder,
        });
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



// The deliberate "send" step: emails the supplier the order. Kept separate from
// creation so nothing reaches a supplier without an explicit action here.
const sendOrder = async (req, res) => {
    try {
        const { OrderId } = req.params;
        const order = await Order.findById(OrderId).populate("Products.product", "name");
        if (!order) return res.status(404).json({ message: "Order not found" });

        if (order.emailSentAt) {
            return res.status(400).json({ message: "This order has already been sent to the supplier" });
        }
        if (!order.supplierEmail) {
            return res.status(400).json({
                message: "This supplier has no email address — add one on the supplier, then send.",
            });
        }
        if (!isMailConfigured()) {
            return res.status(503).json({
                message: "Email is not configured on the server yet, so the order can't be sent.",
            });
        }

        const shop = await Store.findOne({ key: "shop" }).lean();
        const rows = (order.Products || [])
            .map((l) => {
                const name = l.product?.name || "Item";
                return `<tr><td style="border:1px solid #e5e7eb;padding:8px 14px;">${esc(name)}</td>
                        <td style="border:1px solid #e5e7eb;padding:8px 14px;text-align:right;">${l.quantity}</td></tr>`;
            })
            .join("");
        const body = `
          <p><strong>Purchase Order</strong></p>
          <p>Dear ${esc(order.supplierName || "Supplier")},</p>
          <p>Please supply the following:</p>
          <table style="border-collapse:collapse;margin:8px 0;">
            <tr><th style="border:1px solid #e5e7eb;padding:8px 14px;text-align:left;">Product</th>
                <th style="border:1px solid #e5e7eb;padding:8px 14px;">Qty</th></tr>
            ${rows}
          </table>
          ${order.Description ? `<p>${esc(order.Description)}</p>` : ""}
          <p>Kind regards,<br/>${esc(shop?.name || "The shop")}</p>`;

        const result = await sendMail({
            to: order.supplierEmail,
            fromName: shop?.name,
            subject: `Purchase Order — ${order.supplierName || "Order"} (${shop?.name || "Order"})`,
            html: brandedHtml(shop, body),
        });

        if (!result.ok) {
            order.emailError = result.error || result.reason || "send failed";
            await order.save();
            return res.status(502).json({
                message: "Could not send the order email — please try again.",
                error: order.emailError,
            });
        }

        order.emailSentAt = new Date();
        order.emailError = "";
        await order.save();

        await logActivity({
            action: "Send Order",
            description: `Order emailed to ${order.supplierName || "supplier"} (${order.supplierEmail}).`,
            entity: "order",
            entityId: order._id,
            userId: req.user?._id,
            ipAddress: req.ip,
        });

        await order.populate([
            { path: "Products.product", select: "name Price barcode" },
            { path: "user", select: "name email" },
        ]);
        res.status(200).json({ success: true, message: "Order emailed to the supplier", order });
    } catch (error) {
        res.status(500).json({ message: "Error sending order", error: error.message });
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
    sendOrder,
    searchOrder,
    updatestatusOrder,
    getOrder,
    Removeorder,
    getOrderStatistics
};
