// app/routes.js
var User = require('../models/user');
var async = require('async');
var crypto = require('crypto');
var nodemailer = require('nodemailer');


module.exports = function(app, passport) {

	// =====================================
	// HOME PAGE (with login links) ========
	// =====================================
	app.get('/', function(req, res) {
		res.render('login.ejs', { message: '' }); // load the index.ejs file
	});

	// =====================================
	// LOGIN ===============================
	// =====================================
	// show the login form
	app.get('/login', function(req, res) {
		req.session.email = req.body.email;
		// render the page and pass in any flash data if it exists
		res.render('login.ejs', { message: '' });
	});

	app.post('/login', function(req, res, done) { // callback with email and password from our form

		// find a user whose email is the same as the forms email
		// we are checking to see if the user trying to login already exists
		User.findOne({'email': req.body.email}, function (err, user) {
			// if there are any errors, return the error before anything else
			if (err)
				return done(err);

			// if no user is found, return the message
			if (!user)
				return res.render('login.ejs', { message: 'No User Found' });

			// if the user is found but the password is wrong
			if (!user.validPassword(req.body.password))
				return res.render('login.ejs', { message: 'Oops! Wrong Password' });

			// all is well, return successful user
			if (!user.isVerified) {
				console.log(user.isVerified);
				return res.render('login.ejs', { message: 'Your Account is Not Verified' });
			}

			// account not verified
			req.session.user = user;
			req.session.email = req.body.email;

			console.log(req.session.email);
			console.log(user.isVerified);
			console.log(user.isModified);
			
			done(null, user);
			
			return res.redirect('/profile');

		});
	});

	// =====================================
	// SIGNUP ==============================
	// =====================================
	// show the signup form
	app.get('/signup', function(req, res) {

		// render the page and pass in any flash data if it exists
		res.render('signup.ejs', {   message: req.flash('signupMessage') });
	});



	// process the signup form
	app.post('/signup', function(req, res, next) {
		var token;
		async.waterfall([
			function(done) {
				crypto.randomBytes(20, function(err, buf) {
					token = buf.toString('hex');
					done(err, token);
				});
			},
			function(token, done) {
				User.findOne({ 'email': req.body.email }, function(err, user) {
					if (user) {
						console.log('error');
						return res.render('signup', {message : 'That email is already taken.'} );
						//return done(null, false, req.flash('signupMessage', 'That email is already taken.'));
					}else{
						console.log('done');
						var newUser= new User();

						newUser.email		= req.body.email;
						newUser.password 	= newUser.generateHash(req.body.password); // use the generateHash function in our user model
						newUser.firstName	= req.body.firstName;
						newUser.lastName	= req.body.lastName;
						newUser.accountConfirmToken = token;

						newUser.save(function(err) {
							console.log('success ' + token);
							done(err, token, user);
						});
					}

				});
			},
			function(token, user, done) {
				var smtpTransport = nodemailer.createTransport('SMTP', {
					service: 'Gmail',
					auth: {
						user: 'usernamebadge@gmail.com',
						pass: 'mittens123'
					}
				});
				var mailOptions = {
					to: req.body.email,
					from: 'usernamebadge@gmail.com',
					subject: 'Account Confirmation',
					text: 'You are receiving this because you created an account on Idea Bank.\n\n' +
					'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
					'http://' + req.headers.host + '/confirm/' + token + '\n\n' +
					'If you did not request this, please ignore this email.\n'
				};
				smtpTransport.sendMail(mailOptions, function(err) {
					req.flash('info', 'An e-mail has been sent to ' + req.body.email + ' with further instructions.');
					done(err, 'done');
				});
			}
		], function(err) {
			if (err) return next(err);
			res.redirect('/login');
		});
	});

	// =====================================
	// PROFILE SECTION =========================
	// =====================================
	// we will want this protected so you have to be logged in to visit
	// we will use route middleware to verify this (the isLoggedIn function)
	app.get('/profile',  function(req, res) {
		if(!req.session.user) {
			return res.redirect('/login');
		}
		User.findOne({ 'email': req.session.email }, function(err, user) {
			if(err) return res.redirect('/login');
			req.session.user = user;
			res.render('profile.ejs', { user : user });
		});

			//console.log(req.session.user.personal.skills);

	});



	// =====================================
	// LOGOUT ==============================
	// =====================================
	app.get('/logout', function(req, res) {
		req.session.user = false;
		req.logout();
		res.redirect('/');
	});

	var token;

	app.get('/confirm/:token', function(req, res) {
		console.log('hi again' + req.params.token);
		User.findOne({ 'accountConfirmToken': req.params.token }, function(err, user) {
			if (!user) {
				console.log('user not found');
				req.flash('error', 'Confirmation token is invalid or has expired.');
				return res.redirect('/login');
			}
			console.log('In get confirm');
			token = req.params.token;
			res.render('confirm.ejs', {user : User});
		});
	});

	app.post('/confirm', function(req, res, next) {
		async.waterfall([
			function(done) {
				User.findOne({ 'accountConfirmToken': token }, function(err, user) {
					if (!user) {
						req.flash('error', 'Confirmation token is invalid or has expired.');
						console.log('Not found');
						return res.redirect('/');
					}

					user.isVerified = true;

					user.save(function(err) {
						if(err)
							return done(err);
						done(err, user);

					});
				});
			},
			function(user, done) {
				var smtpTransport = nodemailer.createTransport('SMTP', {
					service: 'gmail',
					auth: {
						user: 'usernamebadge@gmail.com',
						pass: 'mittens123'
					}
				});
				var mailOptions = {
					to: user.email,
					from: 'usernamebadge@gmail.com',
					subject: 'Your Account has been verified',
					text: 'Hello,\n\n' +
					'This is a confirmation that the ' + user.email + ' has been verified.\n'
				};
				smtpTransport.sendMail(mailOptions, function(err) {
					req.flash('success', 'Success! Your account is verified.');
					done(err);
				});
			}
		], function(err) {
			if(err) {
				console.log(err);
				return next(err);
			}
			res.redirect('/login');
		});
	});


};


// route middleware to make sure
function isLoggedIn(req, res, next) {

	// if user is authenticated in the session, carry on
	if (req.isAuthenticated())
		return next();

	// if they aren't redirect them to the home page
	res.redirect('/');
}
