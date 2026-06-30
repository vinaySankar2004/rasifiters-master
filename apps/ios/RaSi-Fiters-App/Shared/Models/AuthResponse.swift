import Foundation

struct AuthResponse: Decodable {
    let token: String
    let refreshToken: String?
    let memberId: String?
    let username: String?
    let memberName: String?
    let globalRole: String?
    let user: UserPayload?

    enum CodingKeys: String, CodingKey {
        case token
        case refreshToken = "refresh_token"
        case memberId = "member_id"
        case username
        case memberName = "member_name"
        case globalRole = "global_role"
        case user
    }

    struct UserPayload: Decodable {
        let id: Int?
        let username: String?
        let email: String?
    }
}
