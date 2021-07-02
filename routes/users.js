const { csrfProtection, asyncHandler } = require('./utils');
const express = require('express');
const db = require('../db/models');
const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { requireAuth, loginUser, logoutUser, restoreUser } = require('../auth');
const { Comment } = db;

const router = express.Router();

const userValidator = [
  check('username')
    .exists({ checkFalsy: true })
    .withMessage('Please provide a value for Username')
    .isLength({ max: 50 })
    .withMessage('Username must not be more than 50 characters long')
    .custom((value) => {
      return db.User.findOne({ where: { username: value } })
        .then((user) => {
          if (user) {
            return Promise.reject('The provided Username is already in use by another account');
          }
        });
    }),
  check('password')
    .exists({ checkFalsy: true })
    .withMessage('Please provide a value for Password')
    .isLength({ max: 50 })
    .withMessage('Password must not be more than 50 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, 'g')
    .withMessage('Password must contain at least 1 lowercase letter, uppercase letter, number, and special character (i.e. "!@#$%^&*")'),
  check('confirmPassword')
    .exists({ checkFalsy: true })
    .withMessage('Please provide a value for Confirm Password')
    .isLength({ max: 50 })
    .withMessage('Confirm Password must not be more than 50 characters long')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Confirm Password does not match Password');
      }
      return true;
    }),
];

/* GET users listing. */
router.get('/sign-up', csrfProtection, (req, res, next) => {
  const user = db.User.build() //CREATE EMPTY USER INSTANCE, VIEW BELOW WILL INITIALLY RENDER EMPTY USER FIELDS
  res.render('sign-up', {
    title: 'Sign-up',
    user,
    csrfToken: req.csrfToken(),
  })
});

router.post('/sign-up', csrfProtection, userValidator, asyncHandler(async (req, res) => {
  const {
    username,
    password,
  } = req.body;

  const user = db.User.build({
    username,
  });

  const validationErrors = validationResult(req);
  if (validationErrors.isEmpty()) {
    const hashedPassword = await bcrypt.hash(password, 10);
    user.hashedPassword = hashedPassword;
    await user.save();
    loginUser(req, res, user);
    res.redirect('/users/my-profile');
  } else {
    const errors = validationErrors.array().map((error) => error.msg);
    res.render('sign-up', {
      title: 'Sign-up',
      user,
      errors,
      csrfToken: req.csrfToken()
    })
  };

}))

router.get('/login', csrfProtection, (req, res) => {
  res.render('login', {
    title: 'Login',
    csrfToken: req.csrfToken(),
  });
});

const loginValidators = [
  check('username')
    .exists({ checkFalsy: true })
    .withMessage('Please provide a value for Username'),
  check('password')
    .exists({ checkFalsy: true })
    .withMessage('Please provide a value for Password'),
];

router.post('/login', csrfProtection, loginValidators,
  asyncHandler(async (req, res) => {
    const {
      username,
      password,
    } = req.body;

    let errors = [];
    const validatorErrors = validationResult(req);

    if (validatorErrors.isEmpty()) {
      const user = await db.User.findOne({ where: { username } });
      if(user !== null) {
        const passwordMatch = await bcrypt.compare(password, user.hashedPassword.toString());
        if (passwordMatch) {
          loginUser(req, res, user);
          return res.redirect('/posts/feed');
        }
      }
      errors.push('Login failed for the provided username and password');
    } else {
      errors = validatorErrors.array().map((error) => error.msg);
    }

    res.render('login', {
      title: 'Login',
      username,
      errors,
      csrfToken: req.csrfToken(),
    });
  }));

router.get('/logout', (req, res) => {
  logoutUser(req, res);
  res.redirect('/users/login');
});

router.get('/demo', (async (req, res) => {
  const user = await db.User.findByPk(1);
  loginUser(req, res, user);
  res.redirect('/');
}));

router.get('/my-profile', requireAuth, asyncHandler(async (req, res) => {
  // @feature: will fetch the user's own profile.
  if (req.session.auth) {
     // console.log("local user", res.locals.user);
    const { userId } = req.session.auth;
    const user = await db.User.findByPk(userId);

    if (user) {
      res.render('profile.pug', {
        title: 'Profile Page',
        user,
        viewingUser: user,
      });
    }
  } else {
    res.redirect('/users/login');
  }
}));

router.get('/profile/:id(\\d+)', asyncHandler(async (req, res) => {

  const userId  = parseInt(req.params.id, 10);
  const viewingUser = await db.User.findByPk(userId);

  // console.log("this is our: ", user)

  const ourUser = res.locals.user

  res.render('profile.pug', {
    title: 'Profile Page',
    user: ourUser,
    viewingUser,
  });
}));

router.get('/follow/:id(\\d+)', asyncHandler(async (req,res)=>{
  const userToFollowID = parseInt(req.params.id, 10);
  const loggedInUserID = req.session.auth.userId //.userId is placed in res from login in auth.js
  //make sure user is authenticated and user ID is not itself.
  if ((req.session.auth && userToFollowID !== loggedInUserID)){
    //TODO: Verify that the relationship does not exist, if it does exist, send back status error 401;

    //add the follow relationship to db. create the following record
    const follow = await db.Follow.create({followBelongsToUserID:loggedInUserID, followerUserID:userToFollowID})
    res.json({follow});
  }
}));



module.exports = router;
