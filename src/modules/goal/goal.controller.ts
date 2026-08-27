/**
 * Goal Controller
 * File này xử lý HTTP requests/responses cho các goal endpoints
 * Controller layer - chỉ xử lý HTTP, business logic nằm ở Service layer
 */
import { Request, Response } from 'express';
import { GoalService } from './goal.service';
import { handleError } from '../../utils/error-handler';

// Create module-specific error handler
const handleGoalError = (error: any, res: Response) =>
  handleError(error, res, 'Goal');

export const GoalController = {
  /**
   * @swagger
   * /goals:
   *   post:
   *     tags:
   *       - Goals
   *     summary: Tạo mục tiêu mới
   *     description: Tạo mục tiêu mới cho user hiện tại
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - title
   *               - periodType
   *             properties:
   *               title:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 200
   *                 example: "Tiết kiệm 120 triệu"
   *               description:
   *                 type: string
   *                 maxLength: 2000
   *                 example: "Mục tiêu tiết kiệm cho năm 2026"
   *               periodType:
   *                 type: string
   *                 enum: [daily, weekly, monthly, yearly]
   *                 example: "yearly"
   *               trackingType:
   *                 type: string
   *                 enum: [checkbox, value, progress]
   *                 default: checkbox
   *                 example: "value"
   *               targetValue:
   *                 type: number
   *                 minimum: 0
   *                 example: 120000000
   *               currentValue:
   *                 type: number
   *                 minimum: 0
   *                 default: 0
   *                 example: 0
   *               unit:
   *                 type: string
   *                 maxLength: 50
   *                 example: "đ"
   *               parentGoalId:
   *                 type: string
   *                 format: uuid
   *                 description: ID của goal cha (cho monthly goals link to yearly)
   *               autoCalculate:
   *                 type: boolean
   *                 default: false
   *                 description: Tự động tính từ sub-goals
   *               status:
   *                 type: string
   *                 enum: [pending, in_progress, completed, failed]
   *                 default: pending
   *               priority:
   *                 type: string
   *                 enum: [low, medium, high]
   *                 default: medium
   *               category:
   *                 type: string
   *                 enum: [personal, finance, health, education, career]
   *               year:
   *                 type: integer
   *                 minimum: 2000
   *                 maximum: 2100
   *                 example: 2026
   *               month:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 12
   *                 example: 2
   *               milestones:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     title:
   *                       type: string
   *                     targetDate:
   *                       type: string
   *                       format: date
   *               createMonthlySubGoals:
   *                 type: boolean
   *                 default: false
   *                 description: Tự động tạo 12 monthly sub-goals (cho yearly goals)
   *               monthlyTargetValue:
   *                 type: number
   *                 description: Mục tiêu mỗi tháng (khi createMonthlySubGoals = true)
   *     responses:
   *       201:
   *         description: Goal được tạo thành công
   *       400:
   *         description: Validation error
   *       401:
   *         description: Chưa đăng nhập
   */
  async createGoal(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const goal = await GoalService.createGoal(req.body, userId);
      return res.status(201).json({
        message: 'Goal created successfully',
        goal,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },

  /**
   * @swagger
   * /goals:
   *   get:
   *     tags:
   *       - Goals
   *     summary: Lấy danh sách mục tiêu
   *     description: Lấy danh sách mục tiêu của user hiện tại với pagination và filters
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: periodType
   *         schema:
   *           type: string
   *           enum: [daily, weekly, monthly, yearly]
   *         description: Lọc theo chu kỳ
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, in_progress, completed, failed]
   *         description: Lọc theo trạng thái
   *       - in: query
   *         name: priority
   *         schema:
   *           type: string
   *           enum: [low, medium, high]
   *         description: Lọc theo độ ưu tiên
   *       - in: query
   *         name: category
   *         schema:
   *           type: string
   *           enum: [personal, finance, health, education, career]
   *         description: Lọc theo danh mục
   *       - in: query
   *         name: year
   *         schema:
   *           type: integer
   *         description: Lọc theo năm
   *       - in: query
   *         name: month
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 12
   *         description: Lọc theo tháng
   *       - in: query
   *         name: parentGoalId
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Lọc theo goal cha
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 50
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *     responses:
   *       200:
   *         description: Danh sách goals
   *       401:
   *         description: Chưa đăng nhập
   */
  async getGoals(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // req.query values are always strings — parse numerics explicitly
      const q = req.query as Record<string, string | undefined>;
      const parsed = {
        periodType:   q.periodType as any,
        status:       q.status as any,
        priority:     q.priority as any,
        category:     q.category as any,
        parentGoalId: q.parentGoalId,
        year:   q.year  ? parseInt(q.year,  10) || undefined : undefined,
        month:  q.month ? parseInt(q.month, 10) || undefined : undefined,
        limit:  q.limit ? Math.min(100, Math.max(1, parseInt(q.limit, 10) || 50)) : 50,
        offset: q.offset ? Math.max(0, parseInt(q.offset, 10) || 0) : 0,
      };

      const result = await GoalService.getGoals(userId, parsed);
      return res.status(200).json({
        message: 'Goals retrieved successfully',
        ...result,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },


  /**
   * Lấy goal theo ID
   * GET /api/goals/:id
   */
  async getGoal(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const goal = await GoalService.getGoalById(req.params.id, userId);
      if (!goal) {
        return res.status(404).json({ message: 'Goal not found' });
      }

      return res.status(200).json({
        message: 'Goal retrieved successfully',
        goal,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },

  /**
   * Cập nhật goal
   * PUT /api/goals/:id
   */
  async updateGoal(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const goal = await GoalService.updateGoal(req.params.id, userId, req.body);
      return res.status(200).json({
        message: 'Goal updated successfully',
        goal,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },

  /**
   * Xóa goal
   * DELETE /api/goals/:id
   */
  async deleteGoal(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const goal = await GoalService.deleteGoal(req.params.id, userId);
      return res.status(200).json({
        message: 'Goal deleted successfully',
        goal,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },

  /**
   * Lấy thống kê goals
   * GET /api/goals/stats/summary
   */
  async getGoalStats(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const stats = await GoalService.getGoalStats(userId);
      return res.status(200).json({
        message: 'Goal stats retrieved successfully',
        stats,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },

  /**
   * Tạo milestone cho goal
   * POST /api/goals/milestones
   */
  async createMilestone(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const milestone = await GoalService.createMilestone(req.body, userId);
      return res.status(201).json({
        message: 'Milestone created successfully',
        milestone,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },

  /**
   * Cập nhật milestone
   * PUT /api/goals/milestones/:id
   */
  async updateMilestone(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const milestone = await GoalService.updateMilestone(req.params.id, userId, req.body);
      return res.status(200).json({
        message: 'Milestone updated successfully',
        milestone,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },

  /**
   * Xóa milestone
   * DELETE /api/goals/milestones/:id
   */
  async deleteMilestone(req: Request, res: Response) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const milestone = await GoalService.deleteMilestone(req.params.id, userId);
      return res.status(200).json({
        message: 'Milestone deleted successfully',
        milestone,
      });
    } catch (e: any) {
      return handleGoalError(e, res);
    }
  },
};
