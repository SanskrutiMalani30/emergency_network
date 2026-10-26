import pytest
from backend.app.schemas.mesh import EmergencyContactCreate, EmergencyNotificationRequest
from backend.app.api.resqmesh import get_contacts, save_contact, send_sos_notification, get_notifications
from backend.app.db.repository import repository

def test_get_emergency_contacts_seeded():
    data = get_contacts(user_id="usr-citizen")
    assert data["name"] == "Sanskruti"
    assert data["phone"] == "9272104399"
    assert data["country_code"] == "+91"

def test_save_emergency_contact():
    payload = EmergencyContactCreate(
        user_id="usr-test-user-42",
        name="Sanskruti Rao",
        phone="9272104399",
        country_code="+91",
        relationship="Sister / Emergency Contact"
    )
    saved = save_contact(payload)
    assert saved["name"] == "Sanskruti Rao"
    assert saved["phone"] == "9272104399"
    assert saved["user_id"] == "usr-test-user-42"

    retrieved = get_contacts(user_id="usr-test-user-42")
    assert retrieved["name"] == "Sanskruti Rao"

def test_send_emergency_notification_with_gps():
    sos_id = "demo-emg-01-flood-hospital"
    req = EmergencyNotificationRequest(
        sos_id=sos_id,
        trigger_source="VOICE",
        contact_name="Sanskruti",
        contact_phone="9272104399",
        country_code="+91",
        lat=21.1458,
        lng=79.0882,
        accuracy_meters=12.5,
        location_status="CURRENT_GPS",
        location_timestamp="2026-10-26T07:30:00Z",
        location_age_str="15 seconds ago"
    )
    result = send_sos_notification(req)
    assert result["sos_id"] == sos_id
    assert result["trigger_source"] == "VOICE"
    assert result["recipient_name"] == "Sanskruti"
    assert "https://maps.google.com/?q=21.1458,79.0882" in result["message_text"]
    assert "SOS ID: demo-emg-01-flood-hospital" in result["message_text"]
    assert result["delivery_status"] in ["PROVIDER_ACCEPTED", "DELIVERY_CONFIRMED", "SMS_SUBMITTED_TO_CARRIER"]

    # Test idempotency: sending again with same sos_id and phone returns same notification_id
    res_repeat = send_sos_notification(req)
    assert res_repeat["notification_id"] == result["notification_id"]

def test_send_emergency_notification_location_unavailable():
    sos_id = "sos-unavail-999"
    req = EmergencyNotificationRequest(
        sos_id=sos_id,
        trigger_source="GESTURE",
        contact_name="Sanskruti",
        contact_phone="9272104399",
        country_code="+91",
        lat=None,
        lng=None,
        location_status="UNAVAILABLE"
    )
    result = send_sos_notification(req)
    assert "Location: UNAVAILABLE" in result["message_text"]
    assert result["google_maps_url"] is None
    assert result["trigger_source"] == "GESTURE"
