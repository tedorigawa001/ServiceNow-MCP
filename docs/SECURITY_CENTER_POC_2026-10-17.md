# Security Center 最小PoC — 2026-10-17

Status: **保留（ユーザー判断、2026-10-17）**。
専用スコープ作成済み／新規Endpoint ACL作成の権限不足で停止。
スコアの取得成功は未確認。専用スコープからのGlideRecordSecure実行も未実施。

管理者作業を含む導入のハードルを考慮し、ユーザーの指示により保留とした。
追加調査・API登録・権限変更・実機検証は進めない。
専用スコープ `x_mcp_sc_poc` はPDIに残し、APIは未公開のままとする。
削除や再開は別途ユーザーの指示を受けて判断する。

対象: `https://dev441827.service-now.com`。
設計: [SECURITY_CENTER_DESIGN.md](SECURITY_CENTER_DESIGN.md)。

## 実施内容と実測

1. `sys_app`, `sys_ws_definition`, `sys_ws_operation`, `sys_ws_version`,
   `sys_security_acl` のメタデータと必須列を読み取り確認。
2. 作成前の `/api/x_mcp_sc_poc/security_center_poc/score` 呼び出しは
   `Requested URI does not represent any resource`（MCPクライアントコード `INVALID_REQUEST`）。
   API未登録を確認したRED段階であり、取得テストの成功ではない。
3. 以下のPoC専用アプリを作成。

   | 項目 | 値 |
   |---|---|
   | Name | MCP Security Center Read-only PoC 20261017 |
   | Scope | `x_mcp_sc_poc` |
   | sys_id | `f48e4da48300931880355160ceaad3a5` |
   | Version | `0.0.1` |
   | Restrict Runtime Access | `enforcing` |

4. 専用REST Endpoint ACL `x_mcp_sc_poc.score_read` の新規作成を試行。
   現在のOAuth認証では `INSUFFICIENT_PRIVILEGES` / `Operation Failed` で拒否された。
   必要な権限の欠落、APIからのACL作成制約などの内訳までは未確定。
5. ACL必須の設計を維持するため、その時点でAPI・リソース作成を中止。
   権限昇格、ロール付与、認証方式切替、標準ACLの変更、別経路でのスクリプト実行は行っていない。

## 停止後の読み取り検証

- 専用アプリは存在し、`runtime_access_tracking=enforcing` を維持。
- 参照可能な定義では、上記名称の新規ACLは0件。
- 専用スコープ内の `sys_ws_definition` と `sys_ws_operation` はいずれも0件。
  このPoCのAPIは作成・公開していない。
- スコアテーブル `sn_vsc_hardening_compliance_scores` の設定は前後で一致。

  | 項目 | 前後共通の値 |
  |---|---|
  | sys_id | `a4af723b8cdd03100a22deb6dd2b4e81` |
  | ws_access | `false` |
  | read_access | `true` |
  | access | 空 |
  | sys_mod_count | `0` |
  | sys_updated_on | `2026-06-12 22:05:15` |

- 同テーブルへのTable API照会は引き続き `User Not Authorized`。
- スコア再計算、スキャン起動、スコアレコードの作成・変更は実施していない。

この結果は「クロススコープから取得不可能」を示すものではない。
実行に必要な入口のACLを作成できず、取得可否の検証に到達していない。

## 再開承認後に必要な管理者作業（保留中は実施しない）

連携ユーザーへ広い管理権限を付与するのではなく、既存の適切な権限を持つ管理者が
以下の**PoC専用ACLだけ**を作成する。標準のテーブルACLは編集しない。
UIで権限昇格が必要な場合も、管理者自身の承認された手順で実施する。

| 項目 | 設定案 |
|---|---|
| Application | MCP Security Center Read-only PoC 20261017 (`x_mcp_sc_poc`) |
| Name | `x_mcp_sc_poc.score_read` |
| Type | REST Endpoint（内部値 `REST_Endpoint`） |
| Operation | `execute` |
| Active | true |
| Admin overrides | false |
| Advanced | true |
| Script | 下記 |

```javascript
answer = gs.hasRole('sn_vsc.security_center_viewer') ||
         gs.hasRole('sn_vsc.security_center_admin');
```

これはPoC専用の入口制限であり、正式設計の専用readerロールによる追加制限は未導入。
`gs.hasRole()` の標準admin判定を含む挙動は維持し、データ参照側では別途
GlideRecordSecureと標準ACL・フィールド権限を適用する。
このACL作成だけで現在のOAuthユーザーがスコアを読めるとは保証しない。

## ACL作成後の次の検証

1. 作成されたACLのスコープ・条件・有効状態を読み取り確認する。
2. 同スコープに、上記ACL・認証必須のGETリソースを非アクティブで作成。
   パラメータは受け付けず、スコアテーブルの固定列を評価日順で最大1件だけ取得する。
3. コードと認可設定を確認後、短時間だけ有効化してOAuthで検証。
   未認証の拒否も確認する。結果が空の場合も正常スコア0点とはしない。
4. 標準ACLまたはクロススコープ制約による拒否なら、緩和せず停止する。
   `sys_scope_privilege` 等の追加許可が必要な場合は、その内容を示して別途承認を求める。
5. 検証後はPoCのAPIを無効化し、標準テーブル設定の前後比較と結果を記録する。

業務コード・MCPツールは未変更。アプリスコープは再開用としてPDIに残している。
この記録はPoC成功や製品APIの実装完了を意味しない。
