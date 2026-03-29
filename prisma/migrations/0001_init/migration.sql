-- CreateTable
CREATE TABLE `users` (
    `user_id` BIGINT NOT NULL,
    `registered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `weight_kg` DOUBLE NOT NULL,
    `height_cm` INTEGER NOT NULL,
    `goal` ENUM('GAIN', 'LOSE', 'MAINTAIN') NOT NULL,
    `target_calories` INTEGER NOT NULL,
    `budget` ENUM('CHEAP', 'MID', 'HIGH') NOT NULL,
    `allow_junk_food` BOOLEAN NOT NULL DEFAULT false,
    `limitations` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logs` (
    `log_id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `action_type` ENUM('REGISTER', 'GENERATE_DAY', 'REGENERATE_MEAL', 'REQUEST_RECIPE', 'EDIT_PROFILE') NOT NULL,
    `input_data` JSON NOT NULL,
    `output_data` JSON NOT NULL,

    INDEX `logs_user_id_timestamp_idx`(`user_id`, `timestamp`),
    INDEX `logs_action_type_timestamp_idx`(`action_type`, `timestamp`),
    PRIMARY KEY (`log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `usda_fdc_id` INTEGER NOT NULL,
    `usda_description` VARCHAR(191) NOT NULL,
    `price_source` VARCHAR(191) NOT NULL,
    `calories_per_100g` DOUBLE NOT NULL,
    `protein_per_100g` DOUBLE NOT NULL,
    `fat_per_100g` DOUBLE NOT NULL,
    `carbs_per_100g` DOUBLE NOT NULL,
    `category` ENUM('MEAT', 'FISH', 'SEAFOOD', 'EGG', 'DAIRY', 'LEGUME', 'GRAIN', 'BREAD', 'FAT', 'NUT', 'VEGETABLE', 'FRUIT', 'SNACK', 'SWEET', 'DRINK') NOT NULL,
    `price_category` ENUM('CHEAP', 'MID', 'HIGH') NOT NULL,
    `restriction_tags` JSON NOT NULL,
    `usage_tags` JSON NOT NULL,
    `default_serving_g` INTEGER NOT NULL,
    `min_serving_g` INTEGER NOT NULL,
    `max_serving_g` INTEGER NOT NULL,
    `is_junk_food` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_name_key`(`name`),
    INDEX `products_category_idx`(`category`),
    INDEX `products_price_category_idx`(`price_category`),
    INDEX `products_is_junk_food_idx`(`is_junk_food`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `logs` ADD CONSTRAINT `logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
