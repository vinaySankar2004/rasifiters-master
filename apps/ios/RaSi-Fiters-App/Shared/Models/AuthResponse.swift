import Foundation

struct AuthResponse: Decodable {
    let token: String
    let refreshToken: String?
    let memberId: String?
    let username: String?
    let memberName: String?
    let globalRole: String?
    let user: UserPayload?
    // Federated sign-in (POST /auth/oauth): a brand-new social user returns needs_profile:true
    // plus a pending session token + the OAuth email/name hints. A plain login leaves these nil,
    // so ONE type decodes both /auth/login/* and /auth/oauth responses.
    let needsProfile: Bool?
    let email: String?
    let firstName: String?
    let lastName: String?

    enum CodingKeys: String, CodingKey {
        case token
        case refreshToken = "refresh_token"
        case memberId = "member_id"
        case username
        case memberName = "member_name"
        case globalRole = "global_role"
        case user
        case needsProfile = "needs_profile"
        case email
        case firstName = "first_name"
        case lastName = "last_name"
    }

    struct UserPayload: Decodable {
        let id: Int?
        let username: String?
        let email: String?
    }
}
