module.exports = {
  "type": "sqlite",
  // "database": "__DEPENDS_ON_PROFILE__",
  "synchronize": true,
  "logging": false,
  "entities": [
    "built/src/entity/*.js"
  ],
  "tsEntities": [
    "src/entity/*.ts"
  ],
  "migrations": [
    "built/src/migration/**/*.js"
  ],
  "tsMigrations": [
    "src/migration/**/*.ts"
  ],
  "subscribers": [
    "built/src/subscriber/**/*.js"
  ],
  "tsSubscribers": [
    "src/subscriber/**/*.ts"
  ],
  "cli": {
    "entitiesDir": "built/src/entity",
    "migrationsDir": "built/src/migration",
    "subscribersDir": "built/src/subscriber"
  },
}