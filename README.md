# 概要
Googleマップの保存済みのリストをインポートする。

# 使い方
1. 保存済みのリストをエクスポートする
   1. エクスポートしたいリストがあるGoogleアカウントでログインする
   2. https://takeout.google.com/settings/takeout へアクセスする
   3. `Saved`を選択してエクスポートする
   4. エクスポートが完了するのを待つ（データ量が少なければ数分で終わる）
   5. エクスポートしたzipファイルを展開する
   6. 展開されたディレクトリに含まれる `お気に入りの場所.csv` または `行ってみたい.csv` というファイルのパスをコピーする
2. エクスポートしたファイルをインポートする
   1. コマンドを実行する（インポートしたいアカウントに二要素認証を設定している場合、実行中に1回だけ二要素認証が要求される）
      > 例1：インポートしたいアカウントのGmailアドレスが`example@gmail.com`、パスワードが`foo`、"お気に入りの場所.csv"のパスが `/tmp/保存済み/お気に入りの場所.csv` の場合、以下のコマンドを実行する。
      > ```javascript
      > node import-list.js "/tmp/保存済み/お気に入りの場所.csv" --email example@gmail.com --pass foo
      > ```

      > 例2："行ってみたい"リストへインポートする場合、`--type want-to-go`オプションを指定する。
      > ```javascript
      > node import-list.js "/tmp/保存済み/行ってみたい.csv" --email example@gmail.com --pass foo --type want-to-go
      > ```
3. 完了
