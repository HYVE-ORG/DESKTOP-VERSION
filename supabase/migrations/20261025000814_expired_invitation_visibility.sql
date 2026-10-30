-- UPDATE exige que a imagem nova continue visível pela política de SELECT.
-- expires_at não é editável por authenticated; não inclui convites válidos.
alter policy invitations_expired_read on forma.invitations
 using (expires_at<=now() and forma.studio_role(studio_id)='coordinator');
