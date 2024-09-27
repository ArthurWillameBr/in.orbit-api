import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";

import { db } from "../db";
import { goalCompletions, goals } from "../db/schema";
import { and, gte, lte, count, eq, sql } from "drizzle-orm";

interface CreateGoalCompletionRequest {
  goalId: string
}

dayjs.extend(weekOfYear);

export async function createGoalCompletion({ goalId }: CreateGoalCompletionRequest) {
    const firstDayOfWeek = dayjs().startOf("week").toDate();
    const lastDayOfWeek = dayjs().endOf("week").toDate();
     const goalCompletionCounts = db.$with("goal_completion_counts").as(
       db
         .select({
           goalId: goalCompletions.goalId,
           completionCount: count(goalCompletions.id).as("completionCount"),
         })
         .from(goalCompletions)
         .where(
           and(
             gte(goalCompletions.createdAt, firstDayOfWeek),
             lte(goalCompletions.createdAt, lastDayOfWeek),
             eq(goalCompletions.goalId, goalId)
           )
         )
         .groupBy(goalCompletions.goalId)
     );

  const result = await db
    .with(goalCompletionCounts)
    .select({
      desiredWeeklyFrequency: goals.desiredWeeklyFrequency,
      completionCounts: sql /* sql */ `
        COALESCE(${goalCompletionCounts.completionCount}, 0) 
        `.mapWith(Number),
    })
    .from(goals)
    .leftJoin(goalCompletionCounts, eq(goalCompletionCounts.goalId, goals.id))
    .where(eq(goals.id, goalId))
    .limit(1);

    const {completionCounts, desiredWeeklyFrequency} = result[0]

    if(completionCounts >= desiredWeeklyFrequency) {
        throw new Error("Goal already completed")
    }

  const InsertResult = await db
    .insert(goalCompletions)
    .values({
      goalId,
    })
    .returning();

  const goalCompletion = InsertResult[0];

  return {
    goalCompletion,
  };
}