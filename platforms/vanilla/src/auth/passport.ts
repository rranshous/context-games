import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { getUserById, getUserByUsername, verifyPassword, User } from '../db/queries.js';

// Configure local strategy
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await getUserByUsername(username);
      if (!user) {
        return done(null, false, { message: 'Incorrect username or password' });
      }

      if (!user.is_active) {
        return done(null, false, { message: 'Account is deactivated' });
      }

      const isValid = await verifyPassword(user, password);
      if (!isValid) {
        return done(null, false, { message: 'Incorrect username or password' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Serialize user to session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await getUserById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;
