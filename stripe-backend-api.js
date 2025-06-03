/**
 * Stripe Backend API for TrackVentories
 * 
 * This file contains all the backend endpoints for Stripe operations.
 * Deploy this on your Node.js server (Express.js recommended).
 * 
 * Required packages:
 * npm install stripe express cors body-parser dotenv
 * 
 * Environment variables needed in .env file:
 * STRIPE_SECRET_KEY=sk_test_your_secret_key_here
 * STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
 * 
 * Set up webhook endpoint: POST /api/stripe/webhook
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

// Initialize Stripe with secret key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware
app.use(cors());

// For webhook verification, we need raw body
app.use('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }));

// For other routes, use JSON parser
app.use(bodyParser.json());

// ============================
// CUSTOMER ENDPOINTS
// ============================

/**
 * Create a new Stripe customer
 */
app.post('/api/stripe/create-customer', async (req, res) => {
  try {
    const { email, name, metadata } = req.body;

    const customer = await stripe.customers.create({
      email: email,
      name: name,
      metadata: metadata || {}
    });

    console.log('Customer created:', customer.id);

    res.json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update a Stripe customer
 */
app.post('/api/stripe/update-customer', async (req, res) => {
  try {
    const { customerId, ...updateData } = req.body;

    const customer = await stripe.customers.update(customerId, updateData);

    res.json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get customer details
 */
app.get('/api/stripe/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await stripe.customers.retrieve(customerId);

    res.json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error('Error retrieving customer:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// PAYMENT METHOD ENDPOINTS
// ============================

/**
 * Attach payment method to customer
 */
app.post('/api/stripe/attach-payment-method', async (req, res) => {
  try {
    const { paymentMethodId, customerId } = req.body;

    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    res.json({
      success: true,
      paymentMethod: paymentMethod
    });
  } catch (error) {
    console.error('Error attaching payment method:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Set default payment method for customer
 */
app.post('/api/stripe/set-default-payment-method', async (req, res) => {
  try {
    const { customerId, paymentMethodId } = req.body;

    const customer = await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    res.json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get customer's payment methods
 */
app.get('/api/stripe/payment-methods/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    res.json({
      success: true,
      paymentMethods: paymentMethods.data
    });
  } catch (error) {
    console.error('Error retrieving payment methods:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      paymentMethods: []
    });
  }
});

/**
 * Delete a payment method
 */
app.delete('/api/stripe/delete-payment-method', async (req, res) => {
  try {
    const { paymentMethodId } = req.body;

    const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);

    res.json({
      success: true,
      paymentMethod: paymentMethod
    });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// SUBSCRIPTION ENDPOINTS
// ============================

/**
 * Create a subscription
 */
app.post('/api/stripe/create-subscription', async (req, res) => {
  try {
    const { customerId, priceId, paymentMethodId } = req.body;

    // Set the default payment method on the customer
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_settings: {
        payment_method_options: {
          card: {
            request_three_d_secure: 'if_required',
          },
        },
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    res.json({
      success: true,
      subscription: subscription
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a trial subscription
 */
app.post('/api/stripe/create-trial-subscription', async (req, res) => {
  try {
    const { customerId, priceId, trialPeriodDays = 7 } = req.body;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialPeriodDays,
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
    });

    res.json({
      success: true,
      subscription: subscription
    });
  } catch (error) {
    console.error('Error creating trial subscription:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update a subscription (change plan)
 */
app.post('/api/stripe/update-subscription', async (req, res) => {
  try {
    const { subscriptionId, priceId } = req.body;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: priceId,
      }],
      proration_behavior: 'create_prorations',
    });

    res.json({
      success: true,
      subscription: updatedSubscription
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Cancel a subscription
 */
app.post('/api/stripe/cancel-subscription', async (req, res) => {
  try {
    const { subscriptionId, cancelImmediately = false } = req.body;

    let subscription;
    if (cancelImmediately) {
      subscription = await stripe.subscriptions.cancel(subscriptionId);
    } else {
      subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }

    res.json({
      success: true,
      subscription: subscription
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get customer's subscriptions
 */
app.get('/api/stripe/subscriptions/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    res.json({
      success: true,
      subscriptions: subscriptions.data
    });
  } catch (error) {
    console.error('Error retrieving subscriptions:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      subscriptions: []
    });
  }
});

// ============================
// INVOICE ENDPOINTS
// ============================

/**
 * Get customer's invoices
 */
app.get('/api/stripe/invoices/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 10 } = req.query;

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      invoices: invoices.data
    });
  } catch (error) {
    console.error('Error retrieving invoices:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      invoices: []
    });
  }
});

/**
 * Download invoice PDF
 */
app.get('/api/stripe/invoice-pdf/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await stripe.invoices.retrieve(invoiceId);
    
    if (!invoice.invoice_pdf) {
      return res.status(404).json({
        success: false,
        error: 'Invoice PDF not available'
      });
    }

    // Redirect to the PDF URL
    res.redirect(invoice.invoice_pdf);
  } catch (error) {
    console.error('Error retrieving invoice PDF:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// WEBHOOK ENDPOINT
// ============================

/**
 * Handle Stripe webhooks
 */
app.post('/api/stripe/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  console.log('Received webhook event:', event.type);

  switch (event.type) {
    case 'customer.subscription.created':
      handleSubscriptionCreated(event.data.object);
      break;
    case 'customer.subscription.updated':
      handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      handleSubscriptionDeleted(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      handlePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      handlePaymentFailed(event.data.object);
      break;
    case 'customer.subscription.trial_will_end':
      handleTrialWillEnd(event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// ============================
// WEBHOOK HANDLERS
// ============================

async function handleSubscriptionCreated(subscription) {
  console.log('Subscription created:', subscription.id);
  // Update your database with subscription info
  // Send welcome email to customer
}

async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id);
  // Update your database with new subscription details
  // Notify customer of plan change
}

async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription deleted:', subscription.id);
  // Update your database to reflect cancellation
  // Send cancellation confirmation email
}

async function handlePaymentSucceeded(invoice) {
  console.log('Payment succeeded for invoice:', invoice.id);
  // Update your records
  // Send receipt to customer
}

async function handlePaymentFailed(invoice) {
  console.log('Payment failed for invoice:', invoice.id);
  // Notify customer of failed payment
  // Update subscription status if needed
}

async function handleTrialWillEnd(subscription) {
  console.log('Trial will end for subscription:', subscription.id);
  // Notify customer that trial is ending
  // Remind them to update payment method
}

// ============================
// UTILITY ENDPOINTS
// ============================

/**
 * Get available prices/plans
 */
app.get('/api/stripe/prices', async (req, res) => {
  try {
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });

    res.json({
      success: true,
      prices: prices.data
    });
  } catch (error) {
    console.error('Error retrieving prices:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      prices: []
    });
  }
});

/**
 * Create a setup intent for future payments
 */
app.post('/api/stripe/create-setup-intent', async (req, res) => {
  try {
    const { customerId } = req.body;

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    res.json({
      success: true,
      client_secret: setupIntent.client_secret
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// ERROR HANDLING
// ============================

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// ============================
// START SERVER
// ============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Stripe API server running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST /api/stripe/create-customer');
  console.log('  POST /api/stripe/create-subscription');
  console.log('  POST /api/stripe/webhook');
  console.log('  GET  /api/stripe/payment-methods/:customerId');
  console.log('  ... and more');
});

module.exports = app;