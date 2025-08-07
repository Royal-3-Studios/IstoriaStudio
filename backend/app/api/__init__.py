from fastapi import APIRouter
from app.api.asset_type.routes import router as asset_type_router
from app.api.generated_asset.routes import router as generated_asset_router
from app.api.auth.routes import router as auth_router
from app.api.image_gen import routes as image_routes
from app.api.purchase.routes import router as purchase_router
from app.api.prompt_log.routes import router as prompt_log_router
from app.api.prompt_type.routes import router as prompt_type_router
from app.api.project.routes import router as project_router
from app.api.project_update_log.routes import router as update_log_router
from app.api.plan import routes as plan_routes
from app.api.subscription import routes as subscription_routes
from app.api.tag.routes import router as tag_router
from app.api.template import routes as template_routes


api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth",  tags=["Auth"])
api_router.include_router(
    purchase_router, prefix="/purchase", tags=["Purchase"])
api_router.include_router(
    prompt_log_router, prefix="/prompt-log", tags=["PromptLog"])
api_router.include_router(
    prompt_type_router, prefix="/prompt-type", tags=["PromptType"])
api_router.include_router(tag_router, prefix="/tag", tags=["Tag"])
api_router.include_router(project_router, prefix="/project", tags=["Project"])
api_router.include_router(
    update_log_router, prefix="/project-update-log", tags=["Project Update Log"])
api_router.include_router(
    asset_type_router, prefix="/asset-type", tags=["Asset Type"])
api_router.include_router(generated_asset_router,
                          prefix="/generated-asset", tags=["Generated Asset"])
api_router.include_router(
    image_routes.router, prefix="/image", tags=["Image Generation"])
api_router.include_router(
    template_routes.router, prefix="/template", tags=["Template"])
api_router.include_router(subscription_routes.router,
                          prefix="/api/subscription", tags=["Subscription"])
api_router.include_router(
    plan_routes.router, prefix="/api/plan", tags=["Plan"])
