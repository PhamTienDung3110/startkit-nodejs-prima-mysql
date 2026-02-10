/*
  Warnings:

  - A unique constraint covering the columns `[loanId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `transaction` ADD COLUMN `loanId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Transaction_loanId_key` ON `Transaction`(`loanId`);

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
