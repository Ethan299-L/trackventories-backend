/**
 * Complete Stripe Backend API for TrackVentories
 * 
 * This file contains all the backend endpoints for Stripe operations including
 * real-time payment method retrieval without local storage.
 * 
 * Required packages:
 * npm install stripe express cors body-parser dotenv helmet
 * 
 * Environment variables needed in .env file:
 * STRIPE_SECRET_KEY=sk_test_your_secret_key_here
 * STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
 * PORT=3000
 * NODE_ENV=production
 * 
 * Deploy this to Heroku, Railway, Vercel, or any Node.js hosting service
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
require('dotenv').config();

// Initialize Stripe with secret key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Security and middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com', 'https://www.yourdomain.com'] 
    : [
        'http://localhost:3000', 
        'http://127.0.0.1:5500',
        'http://localhost:8000',    // Add this line
        'http://127.0.0.1:8000',   // Add this line
        'http://localhost:5000',   // Add common ports
        'http://localhost:3001'    // Add common ports
      ],
  credentials: true
}));

// Or better yet, for development, allow all localhost origins:
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow any localhost origin for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow your production domains
    const allowedOrigins = [
      'https://yourdomain.com',
      'https://www.yourdomain.com',
      'https://your-netlify-site.netlify.app'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ============================
// CUSTOMER ENDPOINTS
// ============================

/**
 * Create a new Stripe customer
 */
app.post('/api/stripe/create-customer', async (req, res) => {
  try {
    const { email, name, metadata } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

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

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID is required'
      });
    }

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
// PAYMENT METHOD ENDPOINTS (UPDATED)
// ============================

/**
 * Get all payment methods for a customer (NO LOCAL STORAGE NEEDED)
 * This is the main endpoint for displaying payment methods in the UI
 */
app.get('/api/stripe/customer/:customerId/payment-methods', async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID is required',
        paymentMethods: []
      });
    }

    // Get all payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 10 // Adjust as needed
    });

    // Get customer to check default payment method
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method;

    // Format the response with safe card details
    const formattedMethods = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card.brand, // 'visa', 'mastercard', etc.
      last4: pm.card.last4, // Last 4 digits
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      funding: pm.card.funding, // 'credit', 'debit', 'prepaid'
      country: pm.card.country,
      fingerprint: pm.card.fingerprint, // Unique card identifier
      isDefault: pm.id === defaultPaymentMethodId,
      created: pm.created,
      // Additional safe metadata
      checks: {
        cvcCheck: pm.card.checks?.cvc_check,
        addressLine1Check: pm.card.checks?.address_line1_check,
        addressPostalCodeCheck: pm.card.checks?.address_postal_code_check
      }
    }));

    res.json({
      success: true,
      paymentMethods: formattedMethods,
      hasMore: paymentMethods.has_more,
      defaultPaymentMethodId: defaultPaymentMethodId
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
 * Attach payment method to customer
 */
app.post('/api/stripe/attach-payment-method', async (req, res) => {
  try {
    const { paymentMethodId, customerId } = req.body;

    if (!paymentMethodId || !customerId) {
      return res.status(400).json({
        success: false,
        error: 'Payment method ID and customer ID are required'
      });
    }

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

    if (!customerId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID and payment method ID are required'
      });
    }

    const customer = await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    res.json({
      success: true,
      customer: customer,
      defaultPaymentMethodId: paymentMethodId
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
 * Delete/detach a payment method
 */
app.delete('/api/stripe/delete-payment-method', async (req, res) => {
  try {
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Payment method ID is required'
      });
    }

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
    const { customerId, priceId, paymentMethodId, trialPeriodDays } = req.body;

    if (!customerId || !priceId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID and price ID are required'
      });
    }

    // Set the default payment method on the customer if provided
    if (paymentMethodId) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    // Create subscription configuration
    const subscriptionData = {
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
    };

    // Add trial period if specified
    if (trialPeriodDays && trialPeriodDays > 0) {
      subscriptionData.trial_period_days = trialPeriodDays;
    }

    const subscription = await stripe.subscriptions.create(subscriptionData);

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
 * Update a subscription (change plan)
 */
app.post('/api/stripe/update-subscription', async (req, res) => {
  try {
    const { subscriptionId, priceId } = req.body;

    if (!subscriptionId || !priceId) {
      return res.status(400).json({
        success: false,
        error: 'Subscription ID and price ID are required'
      });
    }

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

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Subscription ID is required'
      });
    }

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
 * Get customer's subscriptions with detailed information
 */
app.get('/api/stripe/subscriptions/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID is required',
        subscriptions: []
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      expand: ['data.default_payment_method', 'data.items.data.price.product'],
      limit: 10
    });

    // Format subscription data for frontend
    const formattedSubscriptions = subscriptions.data.map(sub => ({
      id: sub.id,
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: sub.canceled_at,
      trialStart: sub.trial_start,
      trialEnd: sub.trial_end,
      created: sub.created,
      items: sub.items.data.map(item => ({
        id: item.id,
        priceId: item.price.id,
        productId: item.price.product,
        unitAmount: item.price.unit_amount,
        currency: item.price.currency,
        interval: item.price.recurring?.interval,
        intervalCount: item.price.recurring?.interval_count,
        quantity: item.quantity
      })),
      defaultPaymentMethod: sub.default_payment_method ? {
        id: sub.default_payment_method.id,
        brand: sub.default_payment_method.card?.brand,
        last4: sub.default_payment_method.card?.last4
      } : null
    }));

    res.json({
      success: true,
      subscriptions: formattedSubscriptions
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
    const { limit = 10, status = 'all' } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID is required',
        invoices: []
      });
    }

    const queryParams = {
      customer: customerId,
      limit: parseInt(limit),
      expand: ['data.payment_intent']
    };

    // Filter by status if specified
    if (status !== 'all') {
      queryParams.status = status;
    }

    const invoices = await stripe.invoices.list(queryParams);

    // Format invoice data
    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amountPaid: invoice.amount_paid,
      amountDue: invoice.amount_due,
      total: invoice.total,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      currency: invoice.currency,
      created: invoice.created,
      dueDate: invoice.due_date,
      paidAt: invoice.status_transitions?.paid_at,
      invoicePdf: invoice.invoice_pdf,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      description: invoice.description,
      lines: invoice.lines.data.map(line => ({
        id: line.id,
        description: line.description,
        amount: line.amount,
        quantity: line.quantity,
        priceId: line.price?.id
      }))
    }));

    res.json({
      success: true,
      invoices: formattedInvoices,
      hasMore: invoices.has_more
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
 * Get specific invoice details
 */
app.get('/api/stripe/invoice/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['payment_intent', 'subscription', 'customer']
    });

    res.json({
      success: true,
      invoice: invoice
    });
  } catch (error) {
    console.error('Error retrieving invoice:', error);
    res.status(400).json({
      success: false,
      error: error.message
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

/**
 * Send invoice to customer
 */
app.post('/api/stripe/send-invoice', async (req, res) => {
  try {
    const { invoiceId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        error: 'Invoice ID is required'
      });
    }

    const invoice = await stripe.invoices.sendInvoice(invoiceId);

    res.json({
      success: true,
      invoice: invoice
    });
  } catch (error) {
    console.error('Error sending invoice:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

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
      limit: 20
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

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID is required'
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session'
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

/**
 * Create a payment intent for one-time payments
 */
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', customerId, paymentMethodId, description } = req.body;

    if (!amount || !customerId) {
      return res.status(400).json({
        success: false,
        error: 'Amount and customer ID are required'
      });
    }

    const paymentIntentData = {
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      customer: customerId,
      description: description,
      automatic_payment_methods: {
        enabled: true,
      },
    };

    if (paymentMethodId) {
      paymentIntentData.payment_method = paymentMethodId;
      paymentIntentData.confirm = true;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    res.json({
      success: true,
      paymentIntent: paymentIntent
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get dashboard statistics for admin
 */
app.get('/api/stripe/dashboard-stats', async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    // Calculate date range
    const now = Math.floor(Date.now() / 1000);
    let createdGte;
    
    switch (period) {
      case '7days':
        createdGte = now - (7 * 24 * 60 * 60);
        break;
      case '30days':
        createdGte = now - (30 * 24 * 60 * 60);
        break;
      case '90days':
        createdGte = now - (90 * 24 * 60 * 60);
        break;
      default:
        createdGte = now - (30 * 24 * 60 * 60);
    }

    // Get customers, subscriptions, and charges
    const [customers, subscriptions, charges] = await Promise.all([
      stripe.customers.list({ created: { gte: createdGte }, limit: 100 }),
      stripe.subscriptions.list({ status: 'active', limit: 100 }),
      stripe.charges.list({ created: { gte: createdGte }, limit: 100 })
    ]);

    // Calculate metrics
    const totalCustomers = customers.data.length;
    const activeSubscriptions = subscriptions.data.length;
    const totalRevenue = charges.data
      .filter(charge => charge.paid)
      .reduce((sum, charge) => sum + charge.amount, 0) / 100;
    const averageOrderValue = charges.data.length > 0 ? totalRevenue / charges.data.length : 0;

    res.json({
      success: true,
      stats: {
        totalCustomers,
        activeSubscriptions,
        totalRevenue,
        averageOrderValue,
        period
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
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
    case 'payment_method.attached':
      handlePaymentMethodAttached(event.data.object);
      break;
    case 'payment_method.detached':
      handlePaymentMethodDetached(event.data.object);
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
  // Notify customer of plan change if needed
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

async function handlePaymentMethodAttached(paymentMethod) {
  console.log('Payment method attached:', paymentMethod.id);
  // Optional: Log payment method addition
}

async function handlePaymentMethodDetached(paymentMethod) {
  console.log('Payment method detached:', paymentMethod.id);
  // Optional: Log payment method removal
}

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

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// ============================
// START SERVER
// ============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Stripe API server running on port ${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('  POST /api/stripe/create-customer');
  console.log('  GET  /api/stripe/customer/:customerId/payment-methods');
  console.log('  POST /api/stripe/set-default-payment-method');
  console.log('  DELETE /api/stripe/delete-payment-method');
  console.log('  POST /api/stripe/create-subscription');
  console.log('  GET  /api/stripe/subscriptions/:customerId');
  console.log('  GET  /api/stripe/invoices/:customerId');
  console.log('  POST /api/stripe/webhook');
  console.log('  GET  /api/stripe/dashboard-stats');
  console.log('  GET  /health');
});

module.exports = app;
