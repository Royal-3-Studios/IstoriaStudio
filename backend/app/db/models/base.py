from pydantic import BaseModel


class OrmBaseModel(BaseModel):
    model_config = {
        "from_attributes": True
    }
