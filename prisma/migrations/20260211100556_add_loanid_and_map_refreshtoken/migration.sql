-- DropForeignKey
ALTER TABLE `refreshtoken` DROP FOREIGN KEY `RefreshToken_userId_fkey`;

-- AddForeignKey
ALTER TABLE `refreshtoken` ADD CONSTRAINT `refreshtoken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `refreshtoken` RENAME INDEX `RefreshToken_expiresAt_idx` TO `refreshtoken_expiresAt_idx`;

-- RenameIndex
ALTER TABLE `refreshtoken` RENAME INDEX `RefreshToken_userId_idx` TO `refreshtoken_userId_idx`;
