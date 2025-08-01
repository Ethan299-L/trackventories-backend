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

// FIXED CORS configuration for TrackVentories
app.use(cors({
  origin: function (origin, callback) {
    console.log('🌐 CORS request from origin:', origin);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('✅ No origin - allowing request');
      return callback(null, true);
    }
    
    // Allow ALL localhost origins for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      console.log('✅ Localhost origin allowed:', origin);
      return callback(null, true);
    }
    
    // Allow your ACTUAL TrackVentories domains
    const allowedOrigins = [
      'https://trackventories.com',           // Your main domain
      'https://www.trackventories.com',       // www version
      'https://trackventories.netlify.app',   // If using Netlify
      'https://trackventories.github.io',     // If using GitHub Pages
      'https://trackventories.vercel.app',    // If using Vercel
      'https://staging.trackventories.com',   // Staging environment
      'https://dev.trackventories.com',       // Development environment
      'https://test.trackventories.com'       // Test environment
    ];
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Production origin allowed:', origin);
      return callback(null, true);
    }
    
    // Additional safety net - allow any trackventories.com subdomain
    if (origin.includes('trackventories.com')) {
      console.log('✅ TrackVentories subdomain allowed:', origin);
      return callback(null, true);
    }
    
    console.log('❌ Origin blocked:', origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// For webhook verification, we need raw body
app.use('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }));

// For other routes, use JSON parser
app.use(bodyParser.json());

// ============================
// BASIC ENDPOINTS
// ============================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'TrackVentories Backend is running!',
    environment: process.env.NODE_ENV || 'development',
    stripe_configured: !!process.env.STRIPE_SECRET_KEY
  });
});

// Root endpoint with API information
app.get('/', (req, res) => {
  res.json({ 
    message: 'TrackVentories Stripe Backend API', 
    status: 'running',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET / - API information',
      'POST /api/stripe/create-customer - Create Stripe customer',
      'POST /api/stripe/update-customer - Update customer',
      'GET /api/stripe/customer/:customerId - Get customer details',
      'GET /api/stripe/all-customers - Get all customers (admin)',
      'GET /api/stripe/customer/:customerId/payment-methods - Get payment methods',
      'POST /api/stripe/attach-payment-method - Attach payment method',
      'POST /api/stripe/set-default-payment-method - Set default payment method',
      'DELETE /api/stripe/delete-payment-method - Delete payment method',
      'POST /api/stripe/create-subscription - Create subscription',
      'POST /api/stripe/update-subscription - Update subscription',
      'POST /api/stripe/cancel-subscription - Cancel subscription',
      'GET /api/stripe/subscriptions/:customerId - Get customer subscriptions',
      'GET /api/stripe/invoices/:customerId - Get customer invoices',
      'GET /api/stripe/invoice/:invoiceId - Get specific invoice',
      'GET /api/stripe/invoice-pdf/:invoiceId - Download invoice PDF',
      'POST /api/stripe/send-invoice - Send invoice to customer',
      'GET /api/stripe/prices - Get available prices/plans',
      'POST /api/stripe/create-setup-intent - Create setup intent',
      'POST /api/stripe/create-payment-intent - Create payment intent',
      'GET /api/stripe/dashboard-stats - Get dashboard statistics',
      'POST /api/stripe/webhook - Stripe webhook handler'
    ],
    timestamp: new Date().toISOString()
  });
});

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

/**
 * Get all Stripe customers for admin interface
 */
app.get('/api/stripe/all-customers', async (req, res) => {
  try {
    const { limit = 50, starting_after } = req.query;
    
    const queryParams = {
      limit: parseInt(limit),
      expand: ['data.subscriptions']
    };

    // Add pagination if starting_after is provided
    if (starting_after) {
      queryParams.starting_after = starting_after;
    }

    const customers = await stripe.customers.list(queryParams);
    
    // Format customer data for admin interface
    const formattedCustomers = customers.data.map(customer => ({
      id: customer.id,
      name: customer.name || 'No name',
      email: customer.email || 'No email',
      created: customer.created,
      subscriptions: customer.subscriptions?.data?.map(sub => ({
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end
      })) || [],
      metadata: customer.metadata,
      defaultSource: customer.default_source,
      invoiceSettings: customer.invoice_settings,
      balance: customer.balance,
      currency: customer.currency,
      delinquent: customer.delinquent
    }));

    res.json({
      success: true,
      customers: formattedCustomers,
      hasMore: customers.has_more,
      totalCount: customers.data.length,
      // Include last customer ID for pagination
      lastCustomerId: customers.data.length > 0 ? customers.data[customers.data.length - 1].id : null
    });
  } catch (error) {
    console.error('Error fetching Stripe customers:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      customers: []
    });
  }
});

// ============================
// PAYMENT METHOD ENDPOINTS
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
            request_three_d_secure: 'automatic',
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
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log('📋 Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  GET  / - API information');
  console.log('  POST /api/stripe/create-customer');
  console.log('  GET  /api/stripe/all-customers - Get all customers (admin)');
  console.log('  GET  /api/stripe/customer/:customerId/payment-methods');
  console.log('  POST /api/stripe/set-default-payment-method');
  console.log('  DELETE /api/stripe/delete-payment-method');
  console.log('  POST /api/stripe/create-subscription');
  console.log('  GET  /api/stripe/subscriptions/:customerId');
  console.log('  GET  /api/stripe/invoices/:customerId');
  console.log('  POST /api/stripe/webhook');
  console.log('  GET  /api/stripe/dashboard-stats');
  console.log('🌐 CORS configured for TrackVentories domains');
});

module.exports = app;
