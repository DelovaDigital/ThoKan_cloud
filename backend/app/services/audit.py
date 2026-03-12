from sqlalchemy.orm import Session

from app.models import AuditLog


def log_event(
    db: Session,
    event_type: str,
    actor_user_id=None,
    entity_type: str | None = None,
    entity_id=None,
    metadata: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    row = AuditLog(
        event_type=event_type,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_metadata=metadata or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    try:
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
