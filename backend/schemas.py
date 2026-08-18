from pydantic import BaseModel, ConfigDict, Field, model_validator

from auth_validation import validate_signup


class SignupRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)
    nickname: str = Field(min_length=2, max_length=20)
    terms_agreed: bool
    privacy_agreed: bool

    @model_validator(mode="after")
    def validate_signup_fields(self):
        try:
            email, password, nickname = validate_signup(
                self.email,
                self.password,
                self.password_confirm,
                self.nickname,
                self.terms_agreed,
                self.privacy_agreed,
            )
        except ValueError as error:
            raise ValueError(str(error)) from error
        self.email = email
        self.password = password
        self.password_confirm = password
        self.nickname = nickname
        return self


class LoginRequest(BaseModel):
    email: str
    password: str


class GenderVerificationRequest(BaseModel):
    test_code: str = Field(min_length=1, max_length=100)


class ProfileUpdateRequest(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=50)
    profile_image: str | None = None


class AccountDeleteRequest(BaseModel):
    confirm: bool


class ReviewPhotoInput(BaseModel):
    photo_data: str = Field(min_length=1)
    photo_name: str | None = Field(default=None, max_length=255)


class ReviewCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    lat: float
    lng: float
    user_score: int = Field(ge=0, le=5)
    photos: list[ReviewPhotoInput] = Field(default_factory=list, max_length=5)
    photo_data: str | None = None
    photo_name: str | None = Field(default=None, max_length=255)


class ReviewUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=2000)
    user_score: int | None = Field(default=None, ge=0, le=5)
    photos: list[ReviewPhotoInput] | None = Field(default=None, max_length=5)


class ReviewReportRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=100)
    detail: str | None = Field(default=None, max_length=1000)


class AdminReportStatusRequest(BaseModel):
    status: str = Field(pattern="^(pending|resolved|rejected)$")


class AdminReviewModerationRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class PublicSafetyZoneCreate(BaseModel):
    zone_id: int
    cctv_count: int = Field(default=0, ge=0)
    lamp_count: int = Field(default=0, ge=0)
    convenience_count: int = Field(default=0, ge=0)
    police_count: int = Field(default=0, ge=0)
    public_safety_score: float = Field(ge=0.0, le=5.0)


class SafetyScoreRequest(BaseModel):
    zone_id: int


class RoutePoint(BaseModel):
    lat: float
    lng: float


class RouteCandidate(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    path: list[RoutePoint]


class RouteSafetyRequest(BaseModel):
    routes: list[RouteCandidate]
