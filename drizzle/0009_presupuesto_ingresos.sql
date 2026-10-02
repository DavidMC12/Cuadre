ALTER TABLE "budget_items" DROP CONSTRAINT "budget_items_category_kind_matches";--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_category_kind_matches" CHECK (("budget_items"."kind" = 'category' and "budget_items"."category_kind" in ('expense', 'income'))
       or ("budget_items"."kind" = 'savings'  and "budget_items"."category_kind" is null));