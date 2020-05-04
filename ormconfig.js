module.exports = {
  "type": "sqlite",
  // "database": "__DEPENDS_ON_PROFILE__",
  "synchronize": true,
  "logging": false,
  "entities": [
    "built/entity/*.js"
  ],
  "tsEntities": [
    "src/entity/*.ts"
  ],
  "migrations": [
    "built/migration/**/*.js"
  ],
  "tsMigrations": [
    "src/migration/**/*.ts"
  ],
  "subscribers": [
    "built/subscriber/**/*.js"
  ],
  "tsSubscribers": [
    "src/subscriber/**/*.ts"
  ],
  "cli": {
    "entitiesDir": "built/entity",
    "migrationsDir": "built/migration",
    "subscribersDir": "built/subscriber"
  }
}