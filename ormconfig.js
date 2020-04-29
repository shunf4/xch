module.exports = {
  "type": "sqlite",
  // "database": "__DEPENDS_ON_PROFILE__",
  "synchronize": true,
  "logging": false,
  "entities": [
    "src/entity/*.ts"
  ],
  "migrations": [
    "src/migration/**/*.ts"
  ],
  "subscribers": [
    "src/subscriber/**/*.ts"
  ],
  "cli": {
    "entitiesDir": "src/entity",
    "migrationsDir": "src/migration",
    "subscribersDir": "src/subscriber"
  }
}